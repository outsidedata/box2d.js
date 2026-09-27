// box2d.js facade — hand-written readers over the flat, wasm-backed buffers for
// contacts, per-step events, sensor overlaps and CollideMover planes, the generated
// out-param math readers, and Box2D's constants.
//
// This file is appended into the Emscripten MODULARIZE factory via --post-js, so
// everything here attaches to the SAME module object as the embind bindings:
//
//   const b2 = await Box2D();
//   const cb = b2.createContactsBuffer();                 // reusable, allocate once
//   const contact = b2.createContact();                   // reusable, allocate once
//   b2.getBodyContactData( cb, bodyId );                  // fills wasm storage, grows if needed
//   for ( let i = 0, n = b2.getNumContacts( cb ); i < n; i++ )
//   {
//     b2.getContactAt( contact, cb, i );                  // out-arg first, fills in place
//     const m = contact.manifold;
//     for ( let p = 0; p < m.pointCount; p++ ) m.points[ p ].separation;
//   }
//
// createX() allocates reusable out-objects; the getXAt() calls fill them in place,
// reading a pure-JS loop over the wasm heap, so scanning allocates nothing and crosses
// the wasm/JS boundary only for the fill.
//
// The packed-record STRIDES below come from bindings.cpp (namespace layout, via
// _layoutMeta()) — a single source of truth. The per-field READ order in each reader
// has to match the C++ packing order by hand.
//
// This file is a TEMPLATE, not linked directly. scripts/build.mjs reads bindings.cpp's
// compiled _layoutMeta()/_outMeta()/_constMeta() getters off a probe module and substitutes the
// placeholder tokens below with literals, emitting build/facade.generated.js — which is
// what gets linked. (Keep the raw tokens out of comments — the build substitutes them.)

// Record strides, published by src/bindings.cpp's layout namespace (injected at build).
const LAYOUT = __B2_LAYOUT__;

function createShapeIdObject() { return { index1: 0, world0: 0, generation: 0 }; }
function createContactIdObject() { return { index1: 0, world0: 0, padding: 0, generation: 0 }; }
function readShapeId( dst, a, o )
{
	dst.index1 = a[ o ]; dst.world0 = a[ o + 1 ]; dst.generation = a[ o + 2 ];
}
function readContactId( dst, a, o )
{
	dst.index1 = a[ o ]; dst.world0 = a[ o + 1 ]; dst.padding = a[ o + 2 ]; dst.generation = a[ o + 3 ] >>> 0;
}

// --- shape id overlaps (sensors) -------------------------------------------
// buffer: { count, data: Int32Array }, 3 int32 per id: index1, world0, generation

function getNumShapeIds( buf ) { return buf.count; }

function createShapeId() { return createShapeIdObject(); }

function getShapeIdAt( out, buf, i )
{
	readShapeId( out, buf.data, i * LAYOUT.shapeId );
	return out;
}

// --- contacts (one fixed record per b2ContactData) ---------------------------
//
//   const cb = b2.createContactsBuffer();          // allocate once
//   // each frame, after stepping:
//   b2.getShapeContactData( cb, shapeId );          // or getBodyContactData( cb, bodyId )
//   for ( let i = 0, n = b2.getNumContacts( cb ); i < n; i++ ) b2.getContactAt( contact, cb, i );
//   // when done:
//   b2.destroyContactsBuffer( cb );                 // frees the wasm storage
//
// Refilling copies nothing to JS and allocates no typed arrays: the data stays in the
// wasm heap and the readers index the live module HEAP views in place. Read the buffer
// before the next step or other allocation — getShapeContactData/getBodyContactData
// re-grab the views, so calling one each frame (after stepping) is always safe.

const CONTACT_STRIDE_I = LAYOUT.contactI32; // contactId(4) shapeIdA(3) shapeIdB(3) pointCount points 2x(id persisted)
const CONTACT_STRIDE_F = LAYOUT.contactF32; // normal(2) rollingImpulse points 2x(anchorA(2) anchorB(2) separation normalImpulse tangentImpulse totalNormalImpulse normalVelocity baseSeparation)
const POINT_STRIDE_I = LAYOUT.pointI32;
const POINT_STRIDE_F = LAYOUT.pointF32;

function getNumContacts( buf ) { return buf.count; }

function createManifoldPoint()
{
	return {
		anchorA: [ 0, 0 ],
		anchorB: [ 0, 0 ],
		separation: 0,
		normalImpulse: 0,
		tangentImpulse: 0,
		totalNormalImpulse: 0,
		normalVelocity: 0,
		baseSeparation: 0,
		id: 0,
		persisted: false,
	};
}

// A Box2D manifold holds at most two points, so both point objects are pre-allocated;
// getContactAt fills points[0..pointCount).
function createContact()
{
	return {
		contactId: createContactIdObject(),
		shapeIdA: createShapeIdObject(),
		shapeIdB: createShapeIdObject(),
		manifold: {
			normal: [ 0, 0 ],
			rollingImpulse: 0,
			pointCount: 0,
			points: [ createManifoldPoint(), createManifoldPoint() ],
		},
	};
}

function getContactAt( out, buf, i )
{
	const a = buf.i32;
	const s = buf.i32Base + i * CONTACT_STRIDE_I;
	readContactId( out.contactId, a, s );
	readShapeId( out.shapeIdA, a, s + 4 );
	readShapeId( out.shapeIdB, a, s + 7 );
	const m = out.manifold;
	const pointCount = a[ s + 10 ];
	m.pointCount = pointCount;

	const f = buf.f32;
	const fs = buf.f32Base + i * CONTACT_STRIDE_F;
	m.normal[ 0 ] = f[ fs ]; m.normal[ 1 ] = f[ fs + 1 ];
	m.rollingImpulse = f[ fs + 2 ];
	for ( let p = 0; p < pointCount; p++ )
	{
		const P = m.points[ p ];
		const pi = s + 11 + p * POINT_STRIDE_I;
		const pf = fs + 3 + p * POINT_STRIDE_F;
		P.anchorA[ 0 ] = f[ pf ]; P.anchorA[ 1 ] = f[ pf + 1 ];
		P.anchorB[ 0 ] = f[ pf + 2 ]; P.anchorB[ 1 ] = f[ pf + 3 ];
		P.separation = f[ pf + 4 ];
		P.normalImpulse = f[ pf + 5 ];
		P.tangentImpulse = f[ pf + 6 ];
		P.totalNormalImpulse = f[ pf + 7 ];
		P.normalVelocity = f[ pf + 8 ];
		P.baseSeparation = f[ pf + 9 ];
		P.id = a[ pi ] & 0xffff;
		P.persisted = a[ pi + 1 ] !== 0;
	}
	return out;
}

function createContactsBuffer()
{
	return {
		_impl: new Module.ContactsBufferImpl(),
		count: 0,
		// views point at the live module HEAP; bases are element offsets into it
		i32: null, i32Base: 0,
		f32: null, f32Base: 0,
	};
}

// Re-point the buffer's views/bases at the current wasm heap. HEAP32/HEAPF32 are
// module-scope views that Emscripten swaps out when memory grows, so grab them fresh
// (a reference copy, no allocation) and recompute the byte->element offsets after every
// fill, when a growing std::vector may have moved too.
function refreshContactsBuffer( buf )
{
	const impl = buf._impl;
	buf.count = impl.count();
	buf.i32 = HEAP32; buf.i32Base = impl.i32Ptr() >> 2;
	buf.f32 = HEAPF32; buf.f32Base = impl.f32Ptr() >> 2;
}

function getShapeContactData( buf, shapeId )
{
	buf._impl.loadFromShape( shapeId );
	refreshContactsBuffer( buf );
	return buf;
}

function getBodyContactData( buf, bodyId )
{
	buf._impl.loadFromBody( bodyId );
	refreshContactsBuffer( buf );
	return buf;
}

function destroyContactsBuffer( buf )
{
	buf._impl.delete();
	buf._impl = null;
}

// --- per-step events (reusable, wasm-backed; zero JS alloc per step) ---------
//
//   const eb = b2.createEventsBuffer();          // allocate once
//   const hit = b2.createContactHitEvent();       // reusable scratch, once
//   // each frame, after stepping:
//   b2.getEvents( eb, worldId );                   // pulls all event groups into wasm storage
//   for ( let i = 0, n = b2.getNumContactHitEvents( eb ); i < n; i++ )
//   {
//     b2.getContactHitEventAt( hit, eb, i );       // fills `hit` in place (out-arg first)
//     hit.shapeIdA; hit.point; hit.normal; hit.approachSpeed;
//   }
//   b2.destroyEventsBuffer( eb );                   // free the wasm storage

const CONTACT_TOUCH_STRIDE = LAYOUT.contactTouch; // shapeIdA(3) shapeIdB(3) contactId(4)
const CONTACT_HIT_STRIDE_I = LAYOUT.contactHitI32; // shapeIdA(3) shapeIdB(3) contactId(4)
const CONTACT_HIT_STRIDE_F = LAYOUT.contactHitF64; // point(2) normal(2) approachSpeed
const BODY_MOVE_STRIDE_I = LAYOUT.bodyMoveI32; //     bodyId(3) fellAsleep userData
const BODY_MOVE_STRIDE_F = LAYOUT.bodyMoveF64; //     transform.p(2) transform.q(c,s)
const SENSOR_TOUCH_STRIDE = LAYOUT.sensorTouch; //    sensorShapeId(3) visitorShapeId(3)
const JOINT_STRIDE = LAYOUT.joint; //                 jointId(3) userData

function createEventsBuffer()
{
	return {
		_impl: new Module.EventsBufferImpl(),
		i32: null, f64: null, // live module HEAP views, refreshed on each getEvents
		contactBeginCount: 0, contactBeginBase: 0,
		contactEndCount: 0, contactEndBase: 0,
		contactHitCount: 0, contactHitI32Base: 0, contactHitF64Base: 0,
		bodyMoveCount: 0, bodyMoveI32Base: 0, bodyMoveF64Base: 0,
		sensorBeginCount: 0, sensorBeginBase: 0,
		sensorEndCount: 0, sensorEndBase: 0,
		jointCount: 0, jointBase: 0,
	};
}

function getEvents( eb, worldId )
{
	const impl = eb._impl;
	impl.loadFrom( worldId );
	// Re-grab HEAP views + byte->element bases (memory may have grown, vectors moved).
	eb.i32 = HEAP32;
	eb.f64 = HEAPF64;
	eb.contactBeginCount = impl.contactBeginCount(); eb.contactBeginBase = impl.contactBeginPtr() >> 2;
	eb.contactEndCount = impl.contactEndCount(); eb.contactEndBase = impl.contactEndPtr() >> 2;
	eb.contactHitCount = impl.contactHitCount();
	eb.contactHitI32Base = impl.contactHitI32Ptr() >> 2; eb.contactHitF64Base = impl.contactHitF64Ptr() >> 3;
	eb.bodyMoveCount = impl.bodyMoveCount();
	eb.bodyMoveI32Base = impl.bodyMoveI32Ptr() >> 2; eb.bodyMoveF64Base = impl.bodyMoveF64Ptr() >> 3;
	eb.sensorBeginCount = impl.sensorBeginCount(); eb.sensorBeginBase = impl.sensorBeginPtr() >> 2;
	eb.sensorEndCount = impl.sensorEndCount(); eb.sensorEndBase = impl.sensorEndPtr() >> 2;
	eb.jointCount = impl.jointCount(); eb.jointBase = impl.jointPtr() >> 2;
	return eb;
}

function destroyEventsBuffer( eb )
{
	eb._impl.delete();
	eb._impl = null;
}

function getNumContactBeginEvents( eb ) { return eb.contactBeginCount; }
function getNumContactEndEvents( eb ) { return eb.contactEndCount; }
function getNumContactHitEvents( eb ) { return eb.contactHitCount; }
function getNumBodyMoveEvents( eb ) { return eb.bodyMoveCount; }
function getNumSensorBeginEvents( eb ) { return eb.sensorBeginCount; }
function getNumSensorEndEvents( eb ) { return eb.sensorEndCount; }
function getNumJointEvents( eb ) { return eb.jointCount; }

// contact begin/end touch events: { shapeIdA, shapeIdB, contactId }
function createContactTouchEvent()
{
	return { shapeIdA: createShapeIdObject(), shapeIdB: createShapeIdObject(), contactId: createContactIdObject() };
}
function readContactTouch( out, eb, i, base )
{
	const a = eb.i32;
	const s = base + i * CONTACT_TOUCH_STRIDE;
	readShapeId( out.shapeIdA, a, s );
	readShapeId( out.shapeIdB, a, s + 3 );
	readContactId( out.contactId, a, s + 6 );
	return out;
}
function getContactBeginEventAt( out, eb, i ) { return readContactTouch( out, eb, i, eb.contactBeginBase ); }
function getContactEndEventAt( out, eb, i ) { return readContactTouch( out, eb, i, eb.contactEndBase ); }

// contact hit events
function createContactHitEvent()
{
	return {
		shapeIdA: createShapeIdObject(),
		shapeIdB: createShapeIdObject(),
		contactId: createContactIdObject(),
		point: [ 0, 0 ],
		normal: [ 0, 0 ],
		approachSpeed: 0,
	};
}
function getContactHitEventAt( out, eb, i )
{
	const a = eb.i32;
	const s = eb.contactHitI32Base + i * CONTACT_HIT_STRIDE_I;
	readShapeId( out.shapeIdA, a, s );
	readShapeId( out.shapeIdB, a, s + 3 );
	readContactId( out.contactId, a, s + 6 );
	const f = eb.f64;
	const fs = eb.contactHitF64Base + i * CONTACT_HIT_STRIDE_F;
	out.point[ 0 ] = f[ fs ]; out.point[ 1 ] = f[ fs + 1 ];
	out.normal[ 0 ] = f[ fs + 2 ]; out.normal[ 1 ] = f[ fs + 3 ];
	out.approachSpeed = f[ fs + 4 ];
	return out;
}

// body move events: { userData, transform: { p, q }, bodyId, fellAsleep }
function createBodyMoveEvent()
{
	return {
		userData: 0,
		transform: { p: [ 0, 0 ], q: [ 1, 0 ] },
		bodyId: createShapeIdObject(),
		fellAsleep: false,
	};
}
function getBodyMoveEventAt( out, eb, i )
{
	const a = eb.i32;
	const s = eb.bodyMoveI32Base + i * BODY_MOVE_STRIDE_I;
	readShapeId( out.bodyId, a, s );
	out.fellAsleep = a[ s + 3 ] !== 0;
	out.userData = a[ s + 4 ] >>> 0;
	const f = eb.f64;
	const fs = eb.bodyMoveF64Base + i * BODY_MOVE_STRIDE_F;
	const t = out.transform;
	t.p[ 0 ] = f[ fs ]; t.p[ 1 ] = f[ fs + 1 ];
	t.q[ 0 ] = f[ fs + 2 ]; t.q[ 1 ] = f[ fs + 3 ];
	return out;
}

// sensor begin/end touch events: { sensorShapeId, visitorShapeId }
function createSensorTouchEvent()
{
	return { sensorShapeId: createShapeIdObject(), visitorShapeId: createShapeIdObject() };
}
function readSensorTouch( out, eb, i, base )
{
	const a = eb.i32;
	const s = base + i * SENSOR_TOUCH_STRIDE;
	readShapeId( out.sensorShapeId, a, s );
	readShapeId( out.visitorShapeId, a, s + 3 );
	return out;
}
function getSensorBeginEventAt( out, eb, i ) { return readSensorTouch( out, eb, i, eb.sensorBeginBase ); }
function getSensorEndEventAt( out, eb, i ) { return readSensorTouch( out, eb, i, eb.sensorEndBase ); }

// joint events: { jointId, userData }
function createJointEvent() { return { jointId: createShapeIdObject(), userData: 0 }; }
function getJointEventAt( out, eb, i )
{
	const a = eb.i32;
	const s = eb.jointBase + i * JOINT_STRIDE;
	readShapeId( out.jointId, a, s );
	out.userData = a[ s + 3 ] >>> 0;
	return out;
}

// --- b2World_CollideMover plane results ---------------------------------------
// The CollideMover callback receives a packed buffer { count, data: Float32Array }
// (LAYOUT.plane floats per plane); read it with these instead of a JS object per plane.

function getNumPlaneResults( buf ) { return buf.count; }
function createPlaneResult()
{
	return { plane: { normal: [ 0, 0 ], offset: 0 }, point: [ 0, 0 ], hit: false };
}
function getPlaneResultAt( out, buf, i )
{
	const d = buf.data;
	const s = i * LAYOUT.plane;
	const nrm = out.plane.normal;
	nrm[ 0 ] = d[ s ]; nrm[ 1 ] = d[ s + 1 ];
	out.plane.offset = d[ s + 2 ];
	out.point[ 0 ] = d[ s + 3 ]; out.point[ 1 ] = d[ s + 4 ];
	out.hit = d[ s + 5 ] !== 0;
	return out;
}

// --- out-param math reads (conventions documented in src/bindings.cpp header) ---
// Each raw `b2X_GetYInto(out, ...)` writes floats to a static wasm scratch; the public
// `b2X_GetY(out, ...) -> out` copies scratch -> the caller's array.
//
// The readers are GENERATED from the binding-site metadata (_outMeta(), injected at build
// time as the OUT-META list below), so this file carries no per-method list. Each
// generated reader is monomorphic + fixed-arity with an unrolled copy and does one wasm
// crossing per read. The static scratch address is stable, so its element offsets are
// baked in as literals; HEAPF32 is re-read each call via getF32() so the reader stays
// correct across memory growth.

// Everything below touches the embind API on Module and installs the public surface. In
// MT (pthread) builds this same post-js ALSO runs inside each worker, where those embind
// fns are not attached to the worker's Module — and workers run Box2D's scheduler tasks,
// never the facade API. So configure the public surface on the main thread only.
// (ENVIRONMENT_IS_PTHREAD is undefined in single-threaded builds — hence the typeof.)
if ( typeof ENVIRONMENT_IS_PTHREAD === 'undefined' || !ENVIRONMENT_IS_PTHREAD )
{
	const SCRATCH = Module.b2_getMathScratch(); // byte pointer to the static float scratch
	const SCRATCH_F32 = SCRATCH >>> 2; //          element base into HEAPF32
	const getF32 = () => HEAPF32;

	const makeOutParamReader = ( rawInto, sizes, trailing ) =>
	{
		const outs = sizes.map( ( _, i ) => `out${i}` );
		const trail = Array.from( { length: trailing }, ( _, i ) => `a${i}` );
		const params = [ ...outs, ...trail ].join( ', ' );

		let byteOff = 0;
		const slotPtrs = sizes.map( ( n ) => { const p = SCRATCH + byteOff; byteOff += n * 4; return p; } );
		const intoArgs = [ ...slotPtrs, ...trail ].join( ', ' );

		let elemOff = 0;
		const copy = sizes.map( ( n, i ) =>
		{
			const base = SCRATCH_F32 + elemOff; elemOff += n;
			let body = '';
			for ( let k = 0; k < n; k++ ) body += `out${i}[${k}]=h[${base + k}];`;
			return body;
		} ).join( '' );

		const ret = outs.length === 1 ? outs[ 0 ] : `[ ${outs.join( ', ' )} ]`;
		return new Function( 'raw', 'getF32',
			`return function(${params}){raw(${intoArgs});const h=getF32();${copy}return ${ret};};` )( rawInto, getF32 );
	};

	for ( const entry of __B2_OUT_META__ )
	{
		const rawName = entry.method + 'Into';
		const raw = Module[ rawName ];
		if ( !raw ) throw new Error( `box2d.js: _outMeta lists ${rawName}, but it is not on the module` );
		delete Module[ rawName ];
		Module[ entry.method ] = makeOutParamReader( raw, entry.sizes, entry.trailing );
	}

	// Box2D's constants: the fixed ones as plain values, the ones scaled by
	// b2SetLengthUnitsPerMeter as getters that re-evaluate the macro on every read.
	Object.assign( Module, Module._constants() );
	const liveConstant = Module._liveConstant;
	for ( const c of __B2_CONST_META__ )
	{
		if ( c.live ) Object.defineProperty( Module, c.name, { get: () => liveConstant( c.name ), enumerable: true, configurable: true } );
	}

	// Strip the internal plumbing from the public module.
	for ( const name of [ 'b2_getMathScratch', '_outMeta', '_retMeta', '_fieldMeta', '_constMeta', '_constants', '_liveConstant', '_layoutMeta' ] )
	{
		delete Module[ name ];
	}

	Object.assign( Module, {
		getNumShapeIds, createShapeId, getShapeIdAt,
		createContactsBuffer, getShapeContactData, getBodyContactData, destroyContactsBuffer,
		getNumContacts, createContact, getContactAt,
		createEventsBuffer, getEvents, destroyEventsBuffer,
		getNumContactBeginEvents, getNumContactEndEvents, getNumContactHitEvents,
		getNumBodyMoveEvents, getNumSensorBeginEvents, getNumSensorEndEvents, getNumJointEvents,
		createContactTouchEvent, getContactBeginEventAt, getContactEndEventAt,
		createContactHitEvent, getContactHitEventAt,
		createBodyMoveEvent, getBodyMoveEventAt,
		createSensorTouchEvent, getSensorBeginEventAt, getSensorEndEventAt,
		createJointEvent, getJointEventAt,
		getNumPlaneResults, createPlaneResult, getPlaneResultAt,
	} );
}
