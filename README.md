# box2d.js

WebAssembly bindings for [Box2D v3](https://github.com/erincatto/box2d), Erin Catto's 2D physics
engine, built with Emscripten and embind.

This is a port of Isaac Mason's [box3d.js](https://github.com/isaac-mason/box3d.js) binding approach
to Box2D: the same build script, out-param readers, packed wasm-backed buffers, probe-driven
metadata codegen and ESM post-processing. A program written against box3d.js ports by changing
`b3` to `b2` and 3D math to 2D math.

- Box2D vendored at `vendor/box2d` (erincatto/box2d `956ce4e`, v3.2.0), built with Emscripten 6.0.10.
- The whole public C API under Box2D's own names: every function in `box2d.h`, `types.h`,
  `collision.h`, `math_functions.h`, `id.h` and `base.h`, every struct and enum, and the public
  constants. `test/smoke.mjs` checks this against the headers.
- `dist/` is committed, so the package installs straight from git with no build step.

```js
import Box2D from 'box2d.js/inline';

const b2 = await Box2D();
const worldDef = b2.b2DefaultWorldDef();
worldDef.gravity = [ 0, -10 ];
const worldId = b2.b2CreateWorld( worldDef );

const bodyDef = b2.b2DefaultBodyDef();
bodyDef.type = b2.b2BodyType.b2_dynamicBody;
bodyDef.position = [ 0, 4 ];
const bodyId = b2.b2CreateBody( worldId, bodyDef );
b2.b2CreatePolygonShape( bodyId, b2.b2DefaultShapeDef(), b2.b2MakeBox( 0.5, 0.5 ) );

b2.b2World_Step( worldId, 1 / 60, 4 );
const p = b2.b2Body_GetPosition( [ 0, 0 ], bodyId ); // out-param first, no allocation
```

## Entry points

| import | build |
|---|---|
| `box2d.js` | single-threaded, `box2d.mjs` + `box2d.wasm` |
| `box2d.js/inline` | single-threaded, wasm inlined in one file |
| `box2d.js/mt` | pthreads, `box2d.mt.mjs` + `box2d.mt.wasm` |
| `box2d.js/mt-inline` | pthreads, wasm inlined |

Types for all four: `dist/box2d.d.ts` (`Box2DModule`, `Box2DFactory`, `Box2DFacade`).

## Conventions

The file header of `src/bindings.cpp` has the whole design. In short:

- `b2Vec2` / `b2Pos` are `[x, y]`, `b2Rot` is `[c, s]`, `b2AABB` is `[lowerX, lowerY, upperX, upperY]`,
  `b2Transform` / `b2WorldTransform` are `{ p, q }`. A list of points is a flat `[x0, y0, x1, y1, ...]`
  (a `Float32Array` coming out; a `number[]` or `Float32Array` going in).
- Getters on worlds, bodies, shapes and joints that return a vector, rotation, box or transform take
  the out array first and return it; a transform fills two outs and returns `[p, q]`.
- Ids are objects (`index1`, `world0`, `generation`, ...). Filter bits, material ids, tree user data
  and stored ids are `bigint`.
- `void*` user data is a number: Box2D stores it and hands it back.
- Per-step events and contact data are read through reusable buffers (`createEventsBuffer` /
  `getEvents` / `get*EventAt`, `createContactsBuffer` / `getBodyContactData` / `getContactAt`);
  sensor overlaps through `b2Shape_GetSensorData` + `getShapeIdAt`; mover planes through
  `getPlaneResultAt`.
- Snapshots and recordings are `Uint8Array`s (`b2World_GetSnapshot`, `b2World_Restore`,
  `b2CreateWorldFromSnapshot`, `b2Recording_GetData`, `b2CreateReplay`). The file helpers
  `b2SaveRecordingToFile` / `b2LoadRecordingFromFile` are not linked (no filesystem).
- JS callbacks (step-time: custom filter, pre-solve, friction, restitution) run on Box2D's worker
  threads when `workerCount > 1` in the `mt` builds, where JS cannot run; use `workerCount` 1 with
  them there. In the single-threaded builds a `workerCount` above 1 runs every task on the calling
  thread, with identical results. Box2D's task-system hooks (`enqueueTask` / `finishTask`) are not
  exposed; the `mt` builds use Box2D's own scheduler on the pthread pool.

## Determinism

The single-threaded builds are cross-platform deterministic: the same calls give the same floats in
Node and in any browser. `test/smoke.mjs` ports Box2D's own determinism scene (falling hinges,
`shared/determinism.c`) and asserts Box2D's expected cross-platform result — sleep step `295`, hash
`0x36564C94` — on every build, and that the `mt` builds match it at worker counts 1 and 4.
`test/determinism.html` runs the same scene in a browser (serve the repo root over HTTP and open it).

The flags that matter:

- `-ffp-contract=off` (Box2D's CMake adds it to the library; the build adds it to the bindings, which
  compile Box2D's inline math). No multiply-add contraction.
- `-msimd128` with Box2D's SSE2 path (`-msse2`): fixed-width wasm SIMD, whose arithmetic is exact
  IEEE on every engine.
- Never `-ffast-math` and never `-mrelaxed-simd` (relaxed SIMD permits platform-dependent fused
  multiply-add and rounding).

## Build

```
node scripts/build.mjs     # needs emcc/em++/emcmake 6.0.10 on PATH (asserted)
node test/smoke.mjs
tsc -p test/tsconfig.json   # types.ts against dist/box2d.d.ts via box2d.js/inline
```

## License

MIT (`LICENSE`). Box2D is MIT (`LICENSE-box2d`).
