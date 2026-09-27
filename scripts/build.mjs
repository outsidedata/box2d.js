// Build box2d.js: compile Box2D (static lib) with the Emscripten toolchain, then link
// the embind bindings into ES-module outputs.
//
// Single-threaded (default):
//   dist/box2d.mjs + dist/box2d.wasm   (separate wasm)
//   dist/box2d.inline.mjs              (inlined SINGLE_FILE)
//   dist/box2d.d.ts                    (emitted TypeScript defs, shared by all)
//
// Multithreaded (pthreads, opt-in — Box2D's internal scheduler runs on the Emscripten
// pthread pool when worldDef.workerCount > 1):
//   dist/box2d.mt.mjs + dist/box2d.mt.wasm   (separate wasm)
//   dist/box2d.mt.inline.mjs                 (inlined SINGLE_FILE)
//
// Requires the Emscripten SDK on PATH (emcmake / em++). MT builds need cross-origin
// isolation (COOP: same-origin, COEP: require-corp) in the browser for SharedArrayBuffer.
//
// Determinism: Box2D is cross-platform deterministic when floating-point contraction
// is off and no fast-math is used (https://box2d.org/posts/2024/08/determinism/).
// Box2D's CMake adds -ffp-contract=off for every clang build and uses its SSE2 path on
// wasm through -msimd128 -msse2 (fixed-width wasm simd128, whose arithmetic is exact
// IEEE); the bindings are compiled with the same -ffp-contract=off and -msimd128. Never
// add -ffast-math or -mrelaxed-simd (relaxed simd allows platform-dependent FMA and
// rounding). test/smoke.mjs checks the result against Box2D's own cross-platform hash.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const debug = process.argv.includes( '--debug' );

// Box2D clamps workerCount to [1, B2_MAX_WORKERS] (=32). The Emscripten pthread pool
// must be >= the max threads the scheduler can spawn or it deadlocks (the
// well-documented JoltPhysics.js gotcha), so size the pool to 32.
const PTHREAD_POOL_SIZE = 32;
const MAXIMUM_MEMORY = 2147483648; // 2 GiB — required with growth + shared memory

// Pin the Emscripten toolchain. The ESM post-processing in validateESModule()
// pattern-matches emscripten's generated output, so an unexpected emcc version can
// silently change that output and break the rewrites. Assert it up front. Bump this
// (and re-verify the build) intentionally when upgrading emsdk.
const REQUIRED_EMSDK = '6.0.10';

function run( cmd, args )
{
	console.log( `\n$ ${cmd} ${args.join( ' ' )}\n` );
	execFileSync( cmd, args, { stdio: 'inherit', cwd: root } );
}

function assertEmscriptenVersion()
{
	let out;
	try
	{
		out = execFileSync( 'em++', [ '--version' ], { cwd: root, encoding: 'utf8' } );
	}
	catch ( err )
	{
		throw new Error( 'em++ not found on PATH — source the emsdk env first (emsdk_env). ' + err.message );
	}
	// e.g. "emcc (Emscripten gcc/clang-like replacement ...) 6.0.10 (...)"
	const m = out.match( /\b(\d+\.\d+\.\d+)\b/ );
	if ( !m ) throw new Error( `could not parse emcc version from:\n${out}` );
	if ( m[ 1 ] !== REQUIRED_EMSDK )
	{
		throw new Error(
			`emsdk ${m[ 1 ]} detected but this build is pinned to ${REQUIRED_EMSDK}. ` +
			`Install it via \`emsdk install ${REQUIRED_EMSDK} && emsdk activate ${REQUIRED_EMSDK}\`, ` +
			`or update REQUIRED_EMSDK in scripts/build.mjs after re-verifying the build.`,
		);
	}
	console.log( `emsdk ${m[ 1 ]} OK` );
}

// Post-process an emitted module into clean, valid ESM:
//
// 1. Emscripten's Node support code (-sENVIRONMENT=...,node) loads node builtins with
//    require() via a createRequire shim. That's valid ESM at runtime, but bundlers flag
//    the require() calls when the file is consumed as an ES module. The calls all sit at
//    the top level of the async MODULARIZE factory, so rewrite them to await import
//    (node builtins expose everything as named exports) and drop the dead shim.
//
// 2. SINGLE_FILE builds (*.inline.mjs) embed the wasm, so emscripten's file readers
//    (readAsync / readBinary, the node:fs / node:path / node:url imports) are dead code.
//    Strip them so the inline builds carry no node builtin references and bundle with no
//    config.
//
// A --debug build is for local debugging, not bundling: it keeps emscripten's output as is
// (valid ESM at runtime). Its unminified runtime calls require() inside synchronous debug
// helpers (dbg) and names readAsync in -sASSERTIONS checks, which neither rewrite can carry.
function validateESModule( file )
{
	if ( debug ) return;
	const path = join( root, file );
	let src = readFileSync( path, 'utf8' );

	// require() -> await import
	src = src.replaceAll( /\brequire\(\s*["']([^"']+)["']\s*\)/g, '(await import("$1"))' );
	// node: scheme on every builtin import (emscripten emits some itself, bare)
	src = src.replaceAll( /\bimport\(\s*["'](?:node:)?(fs|path|url|util|module|crypto|worker_threads)["']\s*\)/g, 'import("node:$1")' );
	src = src.replace( /const\s*{\s*createRequire\s*}\s*=\s*await import\(\s*["'](?:node:)?module["']\s*\);?\s*(?:\/\*\*[^]*?\*\/\s*)?var require\s*=\s*createRequire\(\s*import\.meta\.url\s*\);?/, '' );
	if ( /\brequire\s*\(\s*["']/.test( src ) || src.includes( 'createRequire(import.meta.url)' ) )
	{
		throw new Error( `${file}: require() still present after rewrite — did emscripten's output change?` );
	}

	// dead file readers (SINGLE_FILE builds only)
	if ( file.includes( '.inline.' ) )
	{
		// arrow function with at most one nested brace level, which covers all of
		// emscripten's reader closures
		const arrow = /(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/.source;
		src = src.replaceAll( new RegExp( `\\b(?:readAsync|readBinary)=${arrow};?`, 'g' ), '' );
		src = src.replace( 'var readAsync,readBinary;', '' );
		src = src.replace( /var fs=\(await import\("node:fs"\)\);?/, '' );
		// Node-only scriptDirectory computation, the sole user of node:path/node:url
		src = src.replace( /if\(_scriptName\.startsWith\("file:"\)\)\{scriptDirectory=[^{}]*\}/, '' );
		for ( const leftover of [ 'readAsync', 'readBinary', 'readFileSync', 'node:fs', 'node:path', 'node:url' ] )
		{
			if ( src.includes( leftover ) )
			{
				throw new Error( `${file}: ${leftover} still present after strip — did emscripten's output change?` );
			}
		}
	}

	writeFileSync( path, src );
}

function findFile( dir, name )
{
	for ( const e of readdirSync( dir, { withFileTypes: true } ) )
	{
		const p = join( dir, e.name );
		if ( e.isDirectory() )
		{
			const r = findFile( p, name );
			if ( r ) return r;
		}
		else if ( e.name === name )
		{
			return p;
		}
	}
	return null;
}

// Configure + build Box2D as a static lib in its own build dir. Box2D is added as a
// subdirectory of a two-line wrapper project, not configured as the top-level project:
// as top level on Emscripten, Box2D's CMake forces -pthread onto every build (for its own
// samples), which the single-threaded lib must not have. As a subproject it still applies
// its determinism flag (-ffp-contract=off) and its wasm SIMD flags (-msimd128 -msse2), and
// skips samples, tests, docs and heavy validation. `cflags` adds compile flags (used to
// compile Box2D with -pthread for the MT lib).
function buildBox2dLib( buildDir, cflags )
{
	const wrapperDir = join( root, 'build', 'box2d-wrapper' );
	mkdirSync( wrapperDir, { recursive: true } );
	writeFileSync( join( wrapperDir, 'CMakeLists.txt' ),
		'cmake_minimum_required(VERSION 3.22)\n' +
		'project(box2d_js C CXX)\n' +
		`add_subdirectory("${join( root, 'vendor', 'box2d' ).replaceAll( '\\', '/' )}" box2d)\n` );
	const args = [ 'cmake',
		'-S', 'build/box2d-wrapper',
		'-B', buildDir,
		'-DCMAKE_BUILD_TYPE=' + ( debug ? 'Debug' : 'Release' ),
		'-DBOX2D_DISABLE_SIMD=OFF',
		'-DBOX2D_DOUBLE_PRECISION=OFF',
	];
	if ( cflags ) args.push( '-DCMAKE_C_FLAGS=' + cflags );
	run( 'emcmake', args );
	run( 'cmake', [ '--build', buildDir, '--target', 'box2d', '-j', '8' ] );
	const lib = findFile( join( root, buildDir ), debug ? 'libbox2dd.a' : 'libbox2d.a' );
	if ( !lib ) throw new Error( `libbox2d.a not found under ${buildDir}` );
	return lib;
}

assertEmscriptenVersion();

mkdirSync( join( root, 'dist' ), { recursive: true } );
mkdirSync( join( root, 'build' ), { recursive: true } );

// Box2D static libs: single-threaded, and a threaded one (Box2D compiled with -pthread
// -sSHARED_MEMORY so its scheduler uses real threads).
const stLib = buildBox2dLib( 'build/box2d', null );
const mtLib = buildBox2dLib( 'build/box2d-mt', '-pthread -sSHARED_MEMORY' );
console.log( 'box2d ST lib:', stLib );
console.log( 'box2d MT lib:', mtLib );

// Flags common to every link (bindings source + engine lib are prepended per build).
const commonFlags = [
	'-I', 'vendor/box2d/include',
	'-std=c++17',
	'-lembind',
	// NB: the facade post-js (build/facade.generated.js) is NOT here — it is codegen'd from
	// the probe below and appended per shipped build. The probe links without it.
	'-msimd128',
	// Determinism: the bindings compile Box2D's inline math (math_functions.h) too.
	'-ffp-contract=off',
	'-sMODULARIZE=1',
	'-sEXPORT_ES6=1',
	'-sEXPORT_NAME=Box2D',
	'-sALLOW_MEMORY_GROWTH=1',
	'-sFILESYSTEM=0',
	'-sENVIRONMENT=web,worker,node',
	// _malloc / _free let a JS allocator handed to b2SetAllocator hand out wasm memory.
	'-sEXPORTED_FUNCTIONS=_malloc,_free',
	// NDEBUG in release matches how libbox2d.a is built, so Box2D's asserting inline
	// header functions don't pull in the b2InternalAssert symbol the release lib omits.
	...( debug ? [ '-O0', '-g', '-sASSERTIONS=2' ] : [ '-O3', '-DNDEBUG' ] ),
];

// Multithreaded delta (from the JoltPhysics.js MT build).
const mtFlags = [
	'-pthread',
	'-sSHARED_MEMORY',
	`-sPTHREAD_POOL_SIZE=${PTHREAD_POOL_SIZE}`,
	`-sMAXIMUM_MEMORY=${MAXIMUM_MEMORY}`,
];

// --- probe build ---
// Separate-wasm build WITHOUT the facade post-js, used only to (a) emit the shared
// TypeScript defs and (b) be loaded here to read the binding-site metadata. It is
// overwritten below by the real, facade-carrying dist/box2d.mjs.
run( 'em++', [ 'src/bindings.cpp', stLib, ...commonFlags, '--emit-tsd', 'box2d.d.ts', '-o', 'dist/box2d.mjs' ] );
validateESModule( 'dist/box2d.mjs' );

// Read the binding-site metadata straight off the probe: _layoutMeta() (packed-buffer
// strides), _outMeta() (out-param value types + reader shapes), _retMeta() (annotated
// param and return types), _fieldMeta() (val-typed and extra struct fields) and
// _constMeta() (constant declarations). These are the single source of truth for the TS
// types below AND for the generated facade further down.
const { default: Box2DProbe } = await import( pathToFileURL( join( root, 'dist', 'box2d.mjs' ) ).href );
const probe = await Box2DProbe();
const layoutMeta = probe._layoutMeta();
const outMeta = probe._outMeta();
const retMeta = probe._retMeta();
const fieldMeta = probe._fieldMeta();
const constMeta = probe._constMeta();

// Types for the packed buffers, the src/facade.js reader helpers and the constants,
// intersected into Box2DModule below so `b2.getContactAt(...)` etc. are typed.
const facadeTypes = `export type b2Pos = b2Vec2;
export type b2WorldTransform = b2Transform;
export type b2WorldCastOutput = b2CastOutput;
export interface ShapeIdBuffer { count: number; data: Int32Array; }
/** Reusable, wasm-backed contact buffer. Refilling allocates nothing on the JS side;
 * free it with destroyContactsBuffer when done. */
export interface ContactsBuffer {
  count: number;
  i32: Int32Array | null;
  f32: Float32Array | null;
  readonly i32Base: number;
  readonly f32Base: number;
}
/** Reusable, wasm-backed per-step events buffer. Fill with getEvents after each
 * b2World_Step, read with the get*EventAt helpers; free with destroyEventsBuffer. */
export interface EventsBuffer { readonly _brand?: 'EventsBuffer'; }
export interface ContactTouchEvent { shapeIdA: b2ShapeId; shapeIdB: b2ShapeId; contactId: b2ContactId; }
export interface ContactHitEvent {
  shapeIdA: b2ShapeId;
  shapeIdB: b2ShapeId;
  contactId: b2ContactId;
  point: b2Vec2;
  normal: b2Vec2;
  approachSpeed: number;
}
export interface BodyMoveEvent {
  userData: number;
  transform: b2Transform;
  bodyId: b2BodyId;
  fellAsleep: boolean;
}
export interface SensorTouchEvent { sensorShapeId: b2ShapeId; visitorShapeId: b2ShapeId; }
export interface JointEvent { jointId: b2JointId; userData: number; }
/** Packed plane buffer passed to the b2World_CollideMover callback. */
export interface PlaneResultBuffer { count: number; data: Float32Array; }
export interface PlaneResult { plane: { normal: b2Vec2; offset: number }; point: b2Vec2; hit: boolean; }
export interface ManifoldPoint {
  anchorA: b2Vec2;
  anchorB: b2Vec2;
  separation: number;
  normalImpulse: number;
  tangentImpulse: number;
  totalNormalImpulse: number;
  normalVelocity: number;
  baseSeparation: number;
  id: number;
  persisted: boolean;
}
export interface Manifold {
  normal: b2Vec2;
  rollingImpulse: number;
  pointCount: number;
  /** Always two pre-allocated points; points[0..pointCount) are valid. */
  points: [ ManifoldPoint, ManifoldPoint ];
}
/** A b2ContactData read from a ContactsBuffer. */
export interface Contact {
  contactId: b2ContactId;
  shapeIdA: b2ShapeId;
  shapeIdB: b2ShapeId;
  manifold: Manifold;
}
export interface Box2DFacade {
  getNumShapeIds(buf: ShapeIdBuffer): number;
  createShapeId(): b2ShapeId;
  getShapeIdAt(out: b2ShapeId, buf: ShapeIdBuffer, i: number): b2ShapeId;
  createContactsBuffer(): ContactsBuffer;
  getShapeContactData(buf: ContactsBuffer, shapeId: b2ShapeId): ContactsBuffer;
  getBodyContactData(buf: ContactsBuffer, bodyId: b2BodyId): ContactsBuffer;
  destroyContactsBuffer(buf: ContactsBuffer): void;
  getNumContacts(buf: ContactsBuffer): number;
  createContact(): Contact;
  getContactAt(out: Contact, buf: ContactsBuffer, i: number): Contact;
  createEventsBuffer(): EventsBuffer;
  getEvents(eb: EventsBuffer, worldId: b2WorldId): EventsBuffer;
  destroyEventsBuffer(eb: EventsBuffer): void;
  getNumContactBeginEvents(eb: EventsBuffer): number;
  getNumContactEndEvents(eb: EventsBuffer): number;
  getNumContactHitEvents(eb: EventsBuffer): number;
  getNumBodyMoveEvents(eb: EventsBuffer): number;
  getNumSensorBeginEvents(eb: EventsBuffer): number;
  getNumSensorEndEvents(eb: EventsBuffer): number;
  getNumJointEvents(eb: EventsBuffer): number;
  createContactTouchEvent(): ContactTouchEvent;
  getContactBeginEventAt(out: ContactTouchEvent, eb: EventsBuffer, i: number): ContactTouchEvent;
  getContactEndEventAt(out: ContactTouchEvent, eb: EventsBuffer, i: number): ContactTouchEvent;
  createContactHitEvent(): ContactHitEvent;
  getContactHitEventAt(out: ContactHitEvent, eb: EventsBuffer, i: number): ContactHitEvent;
  createBodyMoveEvent(): BodyMoveEvent;
  getBodyMoveEventAt(out: BodyMoveEvent, eb: EventsBuffer, i: number): BodyMoveEvent;
  createSensorTouchEvent(): SensorTouchEvent;
  getSensorBeginEventAt(out: SensorTouchEvent, eb: EventsBuffer, i: number): SensorTouchEvent;
  getSensorEndEventAt(out: SensorTouchEvent, eb: EventsBuffer, i: number): SensorTouchEvent;
  createJointEvent(): JointEvent;
  getJointEventAt(out: JointEvent, eb: EventsBuffer, i: number): JointEvent;
  getNumPlaneResults(buf: PlaneResultBuffer): number;
  createPlaneResult(): PlaneResult;
  getPlaneResultAt(out: PlaneResult, buf: PlaneResultBuffer, i: number): PlaneResult;
}
/** Box2D's public #defines and static const values. */
export interface Box2DConstants {
${constMeta.map( ( c ) => `  readonly ${c.name}: ${c.tsType};` ).join( '\n' )}
}`;

const tsdPath = join( root, 'dist', 'box2d.d.ts' );
let tsd = readFileSync( tsdPath, 'utf8' )
	.replaceAll( 'MainModuleFactory', 'Box2DFactory' )
	.replaceAll( 'MainModule', 'Box2DModule' )
	.replace(
		'export type Box2DModule = WasmModule & EmbindModule;',
		`${facadeTypes}\nexport type Box2DModule = WasmModule & EmbindModule & Box2DFacade & Box2DConstants;`,
	);
if ( !tsd.includes( '& Box2DFacade' ) ) throw new Error( 'tsd: Box2DModule alias not found — did --emit-tsd output change?' );

// Annotated signatures (ret_function): retype the annotated params and the return, keep
// the rest of what emit-tsd inferred.
for ( const { method, params, tsType } of retMeta )
{
	const re = new RegExp( `^(\\s*)${method}\\(([^)]*)\\): ([^;]+);`, 'm' );
	if ( !re.test( tsd ) ) throw new Error( `tsd: no \`${method}(...)\` line to retype — binding renamed/removed?` );
	tsd = tsd.replace( re, ( _, indent, paramList, ret ) =>
	{
		const parts = paramList.length ? paramList.split( ', ' ) : [];
		for ( const p of params )
		{
			if ( p.index >= parts.length ) throw new Error( `tsd: ${method} has no param #${p.index}` );
			parts[ p.index ] = parts[ p.index ].replace( /: .+$/, `: ${p.tsType}` );
		}
		return `${indent}${method}(${parts.join( ', ' )}): ${tsType || ret};`;
	} );
}

// Out-param math reads: rewrite each raw `MethodInto(out: number, ...): void;` embind
// method to its public reader `Method(out: T, ...): T;`, driven by _outMeta. A multi-out
// getter (a transform read as position + rotation) returns a tuple of its out types.
if ( !outMeta.length ) throw new Error( 'tsd: _outMeta() returned no entries — did the out_function DSL change?' );
for ( const { method, tsTypes } of outMeta )
{
	const nOuts = tsTypes.length;
	const re = new RegExp( `^(\\s*)${method}Into\\(([^)]*)\\): void;`, 'm' );
	if ( !re.test( tsd ) ) throw new Error( `tsd: no \`${method}Into(...): void;\` line to retype — binding renamed/removed?` );
	tsd = tsd.replace( re, ( _, indent, params ) =>
	{
		const parts = params.split( ', ' );
		for ( let k = 0; k < nOuts; k++ ) parts[ k ] = parts[ k ].replace( /: .+$/, `: ${tsTypes[ k ]}` );
		const ret = nOuts === 1 ? tsTypes[ 0 ] : `[ ${tsTypes.join( ', ' )} ]`;
		return `${indent}${method}(${parts.join( ', ' )}): ${ret};`;
	} );
}

// Struct fields: retype val-carried fields, add the extra fields wrappers read.
for ( const { typeName, field, tsType, extra } of fieldMeta )
{
	const block = new RegExp( `(export type ${typeName} = \\{)([^}]*)(\\};)` );
	const m = tsd.match( block );
	if ( !m ) throw new Error( `tsd: no \`export type ${typeName} = {...}\` block — did --emit-tsd output change?` );
	let body = m[ 2 ];
	if ( extra )
	{
		body = body.replace( /\s*$/, '' ) + `,\n  ${field}?: ${tsType}\n`;
	}
	else
	{
		const fre = new RegExp( `(\\n\\s*${field}): any` );
		if ( !fre.test( body ) ) throw new Error( `tsd: ${typeName}.${field} is not \`any\` — retype target missing` );
		body = body.replace( fre, `$1: ${tsType}` );
	}
	tsd = tsd.replace( block, `$1${body}$3` );
}

// Internal plumbing — strip from the public types (the facade strips it at runtime).
for ( const name of [ 'b2_getMathScratch', '_outMeta', '_retMeta', '_fieldMeta', '_constMeta', '_constants', '_liveConstant', '_layoutMeta' ] )
{
	const re = new RegExp( `^\\s*${name}\\([^)]*\\): [^;]+;\\r?\\n`, 'm' );
	if ( !re.test( tsd ) ) throw new Error( `tsd: internal ${name} not found to strip` );
	tsd = tsd.replace( re, '' );
}
if ( /\bInto\(/.test( tsd ) ) throw new Error( 'tsd: a raw *Into writer survived the out-param retype' );

writeFileSync( tsdPath, tsd );

// Codegen the facade post-js. src/facade.js is a template: substitute the metadata
// literals read off the probe for its __B2_LAYOUT__ / __B2_OUT_META__ / __B2_CONST_META__
// tokens, so the shipped runtime uses baked-in metadata. Emitted to build/ (not dist/).
const facadeSrc = readFileSync( join( root, 'src', 'facade.js' ), 'utf8' );
for ( const token of [ '__B2_LAYOUT__', '__B2_OUT_META__', '__B2_CONST_META__' ] )
	if ( !facadeSrc.includes( token ) ) throw new Error( `facade codegen: ${token} token missing from src/facade.js` );
const facadeGen = facadeSrc
	.replaceAll( '__B2_LAYOUT__', JSON.stringify( layoutMeta ) )
	.replaceAll( '__B2_OUT_META__', JSON.stringify( outMeta ) )
	.replaceAll( '__B2_CONST_META__', JSON.stringify( constMeta ) );
const facadePost = 'build/facade.generated.js';
writeFileSync( join( root, facadePost ), facadeGen );
const post = [ '--post-js', facadePost ];

// --- single-threaded ---
run( 'em++', [ 'src/bindings.cpp', stLib, ...commonFlags, ...post, '-o', 'dist/box2d.mjs' ] );
validateESModule( 'dist/box2d.mjs' );
run( 'em++', [ 'src/bindings.cpp', stLib, ...commonFlags, ...post, '-sSINGLE_FILE=1', '-o', 'dist/box2d.inline.mjs' ] );
validateESModule( 'dist/box2d.inline.mjs' );

// --- multithreaded (pthreads) ---
run( 'em++', [ 'src/bindings.cpp', mtLib, ...commonFlags, ...mtFlags, ...post, '-o', 'dist/box2d.mt.mjs' ] );
validateESModule( 'dist/box2d.mt.mjs' );
// Single-file MT build: base64-embedding the wasm sidesteps the SharedArrayBuffer +
// separate-wasm-fetch friction (as JoltPhysics.js does).
run( 'em++', [ 'src/bindings.cpp', mtLib, ...commonFlags, ...mtFlags, ...post, '-sSINGLE_FILE=1', '-o', 'dist/box2d.mt.inline.mjs' ] );
validateESModule( 'dist/box2d.mt.inline.mjs' );

console.log( '\nBuild artifacts:' );
for ( const f of [
	'box2d.mjs', 'box2d.wasm', 'box2d.inline.mjs', 'box2d.d.ts',
	'box2d.mt.mjs', 'box2d.mt.wasm', 'box2d.mt.inline.mjs',
] )
{
	try
	{
		const kb = ( statSync( join( root, 'dist', f ) ).size / 1024 ).toFixed( 1 );
		console.log( `  dist/${f.padEnd( 20 )} ${kb} KiB` );
	}
	catch
	{
		console.log( `  dist/${f.padEnd( 20 )} (missing)` );
	}
}
