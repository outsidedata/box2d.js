// box2d.js — hand-written embind bindings for Box2D v3 (Erin Catto, https://box2d.org).
//
// The build/binding design (out_function / ret_function DSLs, packed wasm-backed buffers,
// probe-driven metadata codegen, ESM post-processing) is a port of Isaac Mason's
// box3d.js (https://github.com/isaac-mason/box3d.js) to Box2D's 2D API.
//
// CONVENTIONS (the whole design in one place):
//
// * Flat & faithful. The WHOLE public C API (box2d.h, types.h, collision.h,
//   math_functions.h, id.h, base.h) is bound under Box2D's own names. C structs map to
//   embind value_objects; C functions bind directly. Functions taking a `const b2*Def*`
//   or `const b2Circle*` style pointer are wrapped by a tiny by-value lambda (embind
//   marshals value_objects by value, not by pointer). Param names are embedded in the
//   bound name string ("b2Body_SetLinearVelocity(bodyId, linearVelocity)") so --emit-tsd
//   names them.
//
// * Math is plain arrays, input AND output: b2Vec2 / b2Pos = [x, y] (value_array),
//   b2Rot = [c, s] (flattened like box3d.js flattens b3Quat), b2AABB =
//   [lowerX, lowerY, upperX, upperY], b2Transform / b2WorldTransform = { p, q }.
//   A list of points (a b2Vec2* + count in C) is a flat number list [x0, y0, x1, y1, ...]:
//   a Float32Array coming out, a number[] or Float32Array going in, exactly as box3d.js
//   takes its point clouds. The count is the list length / 2.
//
// * Object-state reads are OUT-PARAM-FIRST and zero-alloc. Every b2World_ / b2Body_ /
//   b2Shape_ / b2Joint_ / b2<Type>Joint_ getter that returns a b2Vec2, b2Pos, b2Rot,
//   b2AABB or transform is declared once with the `out_function` DSL (out_desc::Vec2 /
//   ::Rot / ::AABB descriptors), which binds a raw writer `b2X_GetYInto(out, ...)`
//   (writes floats to the static b2_getMathScratch) AND records metadata into
//   g_outRegistry / _outMeta(). src/facade.js reads _outMeta() to codegen the public
//   `b2X_GetY(out, ...) -> out` reader; scripts/build.mjs reads the same _outMeta() to
//   emit the .d.ts. A transform reads as two out params (b2Vec2 position + b2Rot
//   rotation). Standalone geometry and math functions return their value, as box3d.js
//   does for b3ClipVector / b3ComputeSphereAABB.
//
// * Ids (b2WorldId, b2BodyId, b2ShapeId, b2ChainId, b2JointId, b2ContactId) are small
//   value_objects with Box2D's fields (index1, world0, generation, ...). Filter bits,
//   user material ids, tree proxy user data and stored ids are uint64 = bigint.
//
// * void* user data is a number: the pointer-sized integer Box2D stores and hands back
//   (b2Body_SetUserData(bodyId, 42); b2Body_GetUserData(bodyId) === 42). Box2D never
//   dereferences it, so an index into a JS array is the natural use.
//
// * Bulk/packed reads (contacts, per-step events, sensor overlaps, mover planes) cross
//   the boundary once as a buffer; facade.js scans them alloc-free.
//
// * JS callbacks (queries, custom filter, pre-solve, pre-continuous, friction,
//   restitution, allocator, log, assert, debug draw, dynamic tree) are called on the
//   thread Box2D calls them on. In the pthread (mt) builds the step-time callbacks
//   (custom filter, pre-solve, pre-continuous, friction, restitution) run on worker
//   threads when workerCount > 1, where a JS function cannot be called; use them with
//   workerCount 1 there. Queries and debug draw run on the calling thread.
//
// * Task callbacks (b2WorldDef enqueueTask / finishTask / userTaskContext) are not
//   exposed, exactly as box3d.js does not expose its equivalents: a JS function cannot
//   run a Box2D task on a pthread worker. workerCount > 1 in the mt builds uses Box2D's
//   own internal scheduler on the Emscripten pthread pool.
//
// Types the --emit-tsd pass cannot see (val parameters, val returns, val-typed struct
// fields, struct fields a wrapper accepts beyond the registered ones) are declared at
// the binding site (ret_function signatures, val_field / extra_field) and published
// through _retMeta() / _fieldMeta(); scripts/build.mjs retypes the .d.ts from them.

#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/threading.h>
#include <emscripten/val.h>

#include <box2d/box2d.h>
#include <box2d/collision.h>
#include <box2d/math_functions.h>

using namespace emscripten;

static_assert( sizeof( void* ) == 4, "box2d.js packs user data pointers as 32-bit integers (wasm32)" );
#if defined( BOX2D_DOUBLE_PRECISION )
#error "box2d.js binds the single-precision build: b2Pos is b2Vec2 and b2WorldTransform is b2Transform"
#endif

namespace
{
// --- out-param math reads (see conventions in the file header) ---
// A static float scratch the facade points the raw `*Into` writers at, then copies
// out into the caller's array. 16 floats covers the largest math read.
float g_mathScratch[16];

inline void writeVec2( uintptr_t out, b2Vec2 v )
{
	float* o = reinterpret_cast<float*>( out );
	o[0] = v.x; o[1] = v.y;
}
inline void writeRot( uintptr_t out, b2Rot q )
{
	float* o = reinterpret_cast<float*>( out );
	o[0] = q.c; o[1] = q.s;
}
inline void writeAABB( uintptr_t out, b2AABB a )
{
	float* o = reinterpret_cast<float*>( out );
	o[0] = a.lowerBound.x; o[1] = a.lowerBound.y;
	o[2] = a.upperBound.x; o[3] = a.upperBound.y;
}

// Registries note: Emscripten runs the EMSCRIPTEN_BINDINGS body again on every pthread worker
// (embind's JS type tables are per worker), and the registries below live in memory all threads
// share. So metadata is recorded on the main runtime thread only (recordMeta), and the
// registries are heap objects that are never destroyed: a static destructor would free them
// when a thread runs exit handlers, as a pthread worker of a debug build does.
inline bool recordMeta()
{
	return emscripten_is_main_runtime_thread();
}

// ---- binding-site metadata (single source of truth) ----------------------
// One row per out-param getter, filled during EMSCRIPTEN_BINDINGS by out_function
// and published by the _outMeta() getter. `method` is the public name (no "Into"),
// `sizes` the float count of each out slot, `trailing` the count of forwarded input
// args, `tsTypes` the TS value type of each out slot.
struct OutEntry
{
	std::string method;
	std::vector<int> sizes;
	std::vector<std::string> tsTypes;
	int trailing;
};
std::vector<OutEntry>& g_outRegistry = *new std::vector<OutEntry>(); // never destroyed (see registries note)

namespace out_desc
{
struct Vec2Tag { static constexpr const char* tsType = "b2Vec2"; static constexpr int size = 2; };
struct RotTag { static constexpr const char* tsType = "b2Rot"; static constexpr int size = 2; };
struct AABBTag { static constexpr const char* tsType = "b2AABB"; static constexpr int size = 4; };

template<typename Tag> struct out_t {};
struct pass_t {};
inline constexpr pass_t Pass{};       // a forwarded (non-out) input arg
inline constexpr out_t<Vec2Tag> Vec2{};
inline constexpr out_t<RotTag> Rot{};
inline constexpr out_t<AABBTag> AABB{};

template<typename F> struct FnArity;
template<typename R, typename... A>
struct FnArity<R ( * )( A... )> : std::integral_constant<int, (int)sizeof...( A )> {};

template<typename... Ds> struct DescInfo
{
	static constexpr int nOuts = 0, trailing = 0, totalSize = 0;
	static void sizes( std::vector<int>& ) {}
	static void tsTypes( std::vector<std::string>& ) {}
};
template<typename Tag, typename... Rest> struct DescInfo<out_t<Tag>, Rest...>
{
	static constexpr int nOuts = 1 + DescInfo<Rest...>::nOuts;
	static constexpr int trailing = DescInfo<Rest...>::trailing;
	static constexpr int totalSize = Tag::size + DescInfo<Rest...>::totalSize;
	static void sizes( std::vector<int>& v ) { v.push_back( Tag::size ); DescInfo<Rest...>::sizes( v ); }
	static void tsTypes( std::vector<std::string>& v ) { v.push_back( Tag::tsType ); DescInfo<Rest...>::tsTypes( v ); }
};
template<typename... Rest> struct DescInfo<pass_t, Rest...>
{
	static constexpr int nOuts = DescInfo<Rest...>::nOuts;
	static constexpr int trailing = 1 + DescInfo<Rest...>::trailing;
	static constexpr int totalSize = DescInfo<Rest...>::totalSize;
	static void sizes( std::vector<int>& v ) { DescInfo<Rest...>::sizes( v ); }
	static void tsTypes( std::vector<std::string>& v ) { DescInfo<Rest...>::tsTypes( v ); }
};
} // namespace out_desc

template<typename Fn, typename... Descs>
void out_fn_core( const char* sig, Fn fn, Descs... )
{
	using DI = out_desc::DescInfo<Descs...>;
	static_assert( out_desc::FnArity<Fn>::value == DI::nOuts + DI::trailing,
		"out_function: lambda arity != nOuts + trailing — check descriptors vs lambda params" );
	static_assert( DI::totalSize <= 16,
		"out_function: combined out sizes exceed g_mathScratch[16] — bump it or split the getter" );
	const char* paren = strchr( sig, '(' );
	std::string method = paren ? std::string( sig, paren ) : std::string( sig );
	while ( !method.empty() && method.back() == ' ' ) method.pop_back();
	std::string intoSig = method + "Into" + ( paren ? paren : "()" );
	emscripten::function( intoSig.c_str(), fn );
	std::vector<int> szVec; DI::sizes( szVec );
	std::vector<std::string> tsVec; DI::tsTypes( tsVec );
	if ( recordMeta() ) g_outRegistry.push_back( { method, szVec, tsVec, DI::trailing } );
}
template<typename Tup, std::size_t... I, typename Fn>
void out_fn_dispatch( const char* sig, Fn fn, const Tup& tup, std::index_sequence<I...> )
{
	out_fn_core( sig, fn, std::get<I>( tup )... );
}
// out_function("Name(out, ...)", desc..., +[lambda]) — descriptors then the lambda.
template<typename... Args>
void out_function( const char* sig, Args... args )
{
	auto tup = std::make_tuple( args... );
	constexpr std::size_t N = sizeof...( Args );
	out_fn_dispatch( sig, std::get<N - 1>( tup ), tup, std::make_index_sequence<N - 1>{} );
}

// ---- typed-signature DSL ----
// A lambda taking or returning emscripten::val emits as `any` in --emit-tsd. ret_function
// takes a TypeScript-annotated signature, e.g.
//   "b2World_CastRay(worldId, origin, translation, filter, fcn: (shapeId: b2ShapeId, ...) => number): b2TreeStats"
// binds the embind function under the bare signature ("b2World_CastRay(worldId, ...)")
// and records each annotated param type and the return type into g_retRegistry /
// _retMeta(); scripts/build.mjs retypes the `any`s from that.
struct RetEntry
{
	std::string method;
	std::vector<int> paramIndex;
	std::vector<std::string> paramType;
	std::string tsType; // empty = keep the emitted return type
};
std::vector<RetEntry>& g_retRegistry = *new std::vector<RetEntry>(); // never destroyed (see registries note)

inline std::string trim( const std::string& s )
{
	size_t a = s.find_first_not_of( ' ' ), b = s.find_last_not_of( ' ' );
	return a == std::string::npos ? std::string() : s.substr( a, b - a + 1 );
}

template<typename Fn, typename... Opts>
void ret_function( const char* sig, Fn fn, Opts&&... opts )
{
	std::string s( sig );
	size_t open = s.find( '(' );
	std::string method = trim( s.substr( 0, open ) );
	// find the ')' closing the parameter list and split the params on top-level commas
	int depth = 0;
	size_t close = std::string::npos;
	std::vector<std::string> params;
	std::string cur;
	for ( size_t i = open + 1; i < s.size(); ++i )
	{
		char c = s[i];
		bool arrow = ( c == '>' && i > 0 && s[i - 1] == '=' );
		if ( c == '(' || c == '[' || c == '{' || c == '<' ) ++depth;
		else if ( ( c == ')' || c == ']' || c == '}' || ( c == '>' && !arrow ) ) && depth > 0 ) --depth;
		else if ( c == ')' && depth == 0 ) { close = i; break; }
		if ( c == ',' && depth == 0 ) { params.push_back( cur ); cur.clear(); continue; }
		cur += c;
	}
	if ( !trim( cur ).empty() ) params.push_back( cur );
	RetEntry e{ method, {}, {}, {} };
	std::string bare = method + "(";
	for ( size_t k = 0; k < params.size(); ++k )
	{
		std::string p = trim( params[k] );
		size_t colon = p.find( ':' );
		std::string name = trim( colon == std::string::npos ? p : p.substr( 0, colon ) );
		if ( colon != std::string::npos )
		{
			e.paramIndex.push_back( (int)k );
			e.paramType.push_back( trim( p.substr( colon + 1 ) ) );
		}
		bare += ( k ? ", " : "" ) + name;
	}
	bare += ")";
	if ( close != std::string::npos )
	{
		size_t colon = s.find( ':', close );
		if ( colon != std::string::npos ) e.tsType = trim( s.substr( colon + 1 ) );
	}
	emscripten::function( bare.c_str(), fn, std::forward<Opts>( opts )... );
	if ( recordMeta() ) g_retRegistry.push_back( e );
}

// ---- struct field type DSL ----
// A value_object field carried as emscripten::val (a flat point list, a variable-length
// array of structs) emits as `any`; val_field records its real TS type. extra_field records
// a field a binding wrapper reads off the JS object beyond the registered fields (a body
// name, chain points, debug-draw callbacks). Both land in _fieldMeta() for scripts/build.mjs.
struct FieldEntry
{
	std::string typeName, field, tsType;
	bool extra;
};
std::vector<FieldEntry>& g_fieldRegistry = *new std::vector<FieldEntry>(); // never destroyed (see registries note)

template<typename T, typename G, typename S>
void val_field( value_object<T>& obj, const char* typeName, const char* field, const char* tsType, G getter, S setter )
{
	obj.field( field, getter, setter );
	if ( recordMeta() ) g_fieldRegistry.push_back( { typeName, field, tsType, false } );
}
inline void extra_field( const char* typeName, const char* field, const char* tsType )
{
	if ( recordMeta() ) g_fieldRegistry.push_back( { typeName, field, tsType, true } );
}

// ---- constants ----
// Box2D's public #defines and static const values. embind's constant() carries the value
// as a double, which cannot hold a uint64 (B2_DEFAULT_MASK_BITS), so every constant is a
// val maker instead, attached to the module by the facade. `live` constants depend on
// b2SetLengthUnitsPerMeter and are re-evaluated on every read (a getter), as the macro is.
struct ConstEntry
{
	const char* name;
	const char* tsType;
	val ( *make )();
	bool live;
};
std::vector<ConstEntry>& g_constRegistry = *new std::vector<ConstEntry>(); // never destroyed (see registries note)
inline void constant_value( const char* name, const char* tsType, val ( *make )(), bool live = false )
{
	if ( recordMeta() ) g_constRegistry.push_back( { name, tsType, make, live } );
}

// Point lists: flat [x0, y0, x1, y1, ...] in, Float32Array out.
inline std::vector<b2Vec2> toPoints( const val& list )
{
	std::vector<float> f = convertJSArrayToNumberVector<float>( list );
	std::vector<b2Vec2> pts( f.size() / 2 );
	std::memcpy( pts.data(), f.data(), pts.size() * sizeof( b2Vec2 ) );
	return pts;
}
inline val fromPoints( const b2Vec2* pts, int count )
{
	return val::global( "Float32Array" ).new_( typed_memory_view( (size_t)count * 2, reinterpret_cast<const float*>( pts ) ) );
}
inline val toU8( const uint8_t* data, int size )
{
	return val::global( "Uint8Array" ).new_( typed_memory_view( (size_t)( size > 0 ? size : 0 ), data ) );
}
// A snapshot image (a Uint8Array, or any array of byte values) copied into wasm memory in one block by
// the typed array's own `set`, rather than read one element at a time.
inline std::vector<uint8_t> bytesOf( val image )
{
	std::vector<uint8_t> bytes( image[ "length" ].as<size_t>() );
	val( typed_memory_view( bytes.size(), bytes.data() ) ).call<void>( "set", image );
	return bytes;
}
inline val toI32( const std::vector<int32_t>& v )
{
	return val::global( "Int32Array" ).new_( typed_memory_view( v.size(), v.data() ) );
}
inline val toF32( const float* data, size_t n )
{
	return val::global( "Float32Array" ).new_( typed_memory_view( n, data ) );
}
inline val numberArray( const int* data, int n )
{
	val a = val::array();
	for ( int i = 0; i < n; ++i ) a.call<void>( "push", data[i] );
	return a;
}
inline bool isFn( const val& v )
{
	return v.typeOf().as<std::string>() == "function";
}

// ---- packed-record tier strides (single source of truth) --------------------
// The C++ packers below use these, and _layoutMeta() publishes them so src/facade.js
// reads them instead of keeping its own copies. The per-field READ logic stays
// hand-written in the facade, only these numbers are shared.
namespace layout
{
constexpr int idW = 3;        // b2ShapeId/b2BodyId/b2JointId: index1, world0, generation
constexpr int contactIdW = 4; // b2ContactId: index1, world0, padding, generation

// contacts buffer: one fixed record per b2ContactData (a Box2D manifold has at most 2 points)
constexpr int pointI32 = 1 + 1;                   // id persisted
constexpr int pointF32 = 2 + 2 + 6;               // anchorA anchorB separation normalImpulse tangentImpulse totalNormalImpulse normalVelocity baseSeparation
constexpr int contactI32 = contactIdW + idW + idW + 1 + 2 * pointI32; // 15: contactId shapeIdA shapeIdB pointCount points
constexpr int contactF32 = 2 + 1 + 2 * pointF32;                      // 23: normal rollingImpulse points

// per-step events
constexpr int contactTouch = idW + idW + contactIdW; // 10: shapeIdA shapeIdB contactId
constexpr int contactHitI32 = idW + idW + contactIdW; // 10: shapeIdA shapeIdB contactId
constexpr int contactHitF64 = 2 + 2 + 1;              //  5: point normal approachSpeed
constexpr int bodyMoveI32 = idW + 1 + 1;              //  5: bodyId fellAsleep userData
constexpr int bodyMoveF64 = 2 + 2;                    //  4: transform.p transform.q(c,s)
constexpr int sensorTouch = idW + idW;                //  6: sensorShapeId visitorShapeId
constexpr int joint = idW + 1;                        //  4: jointId userData

// single-record query buffers
constexpr int plane = 2 + 1 + 2 + 1; // 6: plane.normal plane.offset point hit
constexpr int shapeId = idW;         // 3: index1 world0 generation

static_assert( contactI32 == 15 && contactF32 == 23 && pointI32 == 2 && pointF32 == 10,
	"contacts buffer stride changed — update the facade field reads + _layoutMeta" );
static_assert( contactTouch == 10 && contactHitI32 == 10 && contactHitF64 == 5 && bodyMoveI32 == 5
	&& bodyMoveF64 == 4 && sensorTouch == 6 && joint == 4,
	"events buffer stride changed — update the facade field reads + _layoutMeta" );
static_assert( plane == 6 && shapeId == 3, "plane/shapeId stride changed — update the facade field reads + _layoutMeta" );
} // namespace layout

inline void pushShapeId( std::vector<int32_t>& v, b2ShapeId id ) { v.insert( v.end(), { id.index1, (int32_t)id.world0, (int32_t)id.generation } ); }
inline void pushContactId( std::vector<int32_t>& v, b2ContactId id ) { v.insert( v.end(), { id.index1, (int32_t)id.world0, (int32_t)id.padding, (int32_t)id.generation } ); }

// Pack b2ContactData[] into two fixed-stride tiers. The vectors are cleared but keep
// their capacity, so a reused buffer grows to its high-water mark and then allocates
// nothing on refill.
inline void packContactsInto( const b2ContactData* data, int count, std::vector<int32_t>& i32, std::vector<float>& f32 )
{
	i32.clear();
	f32.clear();
	i32.reserve( (size_t)count * layout::contactI32 );
	f32.reserve( (size_t)count * layout::contactF32 );
	for ( int i = 0; i < count; ++i )
	{
		const b2ContactData& c = data[i];
		const b2Manifold& m = c.manifold;
		pushContactId( i32, c.contactId );
		pushShapeId( i32, c.shapeIdA );
		pushShapeId( i32, c.shapeIdB );
		i32.push_back( m.pointCount );
		f32.insert( f32.end(), { m.normal.x, m.normal.y, m.rollingImpulse } );
		for ( int p = 0; p < 2; ++p )
		{
			const b2ManifoldPoint& pt = m.points[p];
			i32.insert( i32.end(), { (int32_t)pt.id, pt.persisted ? 1 : 0 } );
			f32.insert( f32.end(), { pt.anchorA.x, pt.anchorA.y, pt.anchorB.x, pt.anchorB.y, pt.separation, pt.normalImpulse,
									 pt.tangentImpulse, pt.totalNormalImpulse, pt.normalVelocity, pt.baseSeparation } );
		}
	}
}

// A reusable contact buffer whose storage lives in the wasm heap and grows as needed.
// JS reads it in place through the module HEAP views (see src/facade.js), so refilling
// allocates nothing on the JS side. The caller owns its lifetime — createContactsBuffer()
// / destroyContactsBuffer() (embind .delete()). The *Ptr() accessors return the current
// wasm byte offset of each tier; JS re-reads them after every fill.
struct ContactsBuffer
{
	std::vector<b2ContactData> scratch;
	std::vector<int32_t> i32;
	std::vector<float> f32;
	int count = 0;

	void loadFromShape( b2ShapeId shapeId )
	{
		scratch.resize( (size_t)b2Shape_GetContactCapacity( shapeId ) );
		count = scratch.empty() ? 0 : b2Shape_GetContactData( shapeId, scratch.data(), (int)scratch.size() );
		packContactsInto( scratch.data(), count, i32, f32 );
	}
	void loadFromBody( b2BodyId bodyId )
	{
		scratch.resize( (size_t)b2Body_GetContactCapacity( bodyId ) );
		count = scratch.empty() ? 0 : b2Body_GetContactData( bodyId, scratch.data(), (int)scratch.size() );
		packContactsInto( scratch.data(), count, i32, f32 );
	}

	int getCount() const { return count; }
	unsigned i32Ptr() const { return (unsigned)(size_t)i32.data(); }
	unsigned f32Ptr() const { return (unsigned)(size_t)f32.data(); }
};

// Reusable, wasm-backed buffer for per-step events. loadFrom(world) pulls Box2D's four
// event arrays (body move / sensor / contact / joint) into flat tiers in the wasm heap;
// JS reads them in place through the module HEAP views. Each group has an i32 tier and,
// where it carries positions, an f64 tier (b2Pos may be double in large-world builds;
// f64 is lossless either way). The loadFrom packing order must match the facade reads.
struct EventsBuffer
{
	std::vector<int32_t> contactBeginI32, contactEndI32, contactHitI32, bodyMoveI32, sensorBeginI32, sensorEndI32, jointI32;
	std::vector<double> contactHitF64, bodyMoveF64;
	int contactBeginCount = 0, contactEndCount = 0, contactHitCount = 0;
	int bodyMoveCount = 0, sensorBeginCount = 0, sensorEndCount = 0, jointCount = 0;

	void loadFrom( b2WorldId worldId )
	{
		contactBeginI32.clear(); contactEndI32.clear(); contactHitI32.clear(); contactHitF64.clear();
		bodyMoveI32.clear(); bodyMoveF64.clear();
		sensorBeginI32.clear(); sensorEndI32.clear(); jointI32.clear();

		b2BodyEvents be = b2World_GetBodyEvents( worldId );
		bodyMoveCount = be.moveCount;
		for ( int i = 0; i < be.moveCount; ++i )
		{
			const b2BodyMoveEvent& e = be.moveEvents[i];
			bodyMoveI32.insert( bodyMoveI32.end(), { e.bodyId.index1, (int32_t)e.bodyId.world0, (int32_t)e.bodyId.generation,
													 e.fellAsleep ? 1 : 0, (int32_t)(uintptr_t)e.userData } );
			bodyMoveF64.insert( bodyMoveF64.end(), { (double)e.transform.p.x, (double)e.transform.p.y, (double)e.transform.q.c,
													 (double)e.transform.q.s } );
		}

		b2SensorEvents se = b2World_GetSensorEvents( worldId );
		sensorBeginCount = se.beginCount;
		for ( int i = 0; i < se.beginCount; ++i )
		{
			pushShapeId( sensorBeginI32, se.beginEvents[i].sensorShapeId );
			pushShapeId( sensorBeginI32, se.beginEvents[i].visitorShapeId );
		}
		sensorEndCount = se.endCount;
		for ( int i = 0; i < se.endCount; ++i )
		{
			pushShapeId( sensorEndI32, se.endEvents[i].sensorShapeId );
			pushShapeId( sensorEndI32, se.endEvents[i].visitorShapeId );
		}

		b2ContactEvents ce = b2World_GetContactEvents( worldId );
		contactBeginCount = ce.beginCount;
		for ( int i = 0; i < ce.beginCount; ++i )
		{
			pushShapeId( contactBeginI32, ce.beginEvents[i].shapeIdA );
			pushShapeId( contactBeginI32, ce.beginEvents[i].shapeIdB );
			pushContactId( contactBeginI32, ce.beginEvents[i].contactId );
		}
		contactEndCount = ce.endCount;
		for ( int i = 0; i < ce.endCount; ++i )
		{
			pushShapeId( contactEndI32, ce.endEvents[i].shapeIdA );
			pushShapeId( contactEndI32, ce.endEvents[i].shapeIdB );
			pushContactId( contactEndI32, ce.endEvents[i].contactId );
		}
		contactHitCount = ce.hitCount;
		for ( int i = 0; i < ce.hitCount; ++i )
		{
			const b2ContactHitEvent& e = ce.hitEvents[i];
			pushShapeId( contactHitI32, e.shapeIdA );
			pushShapeId( contactHitI32, e.shapeIdB );
			pushContactId( contactHitI32, e.contactId );
			contactHitF64.insert( contactHitF64.end(), { (double)e.point.x, (double)e.point.y, (double)e.normal.x, (double)e.normal.y,
														 (double)e.approachSpeed } );
		}

		b2JointEvents je = b2World_GetJointEvents( worldId );
		jointCount = je.count;
		for ( int i = 0; i < je.count; ++i )
		{
			const b2JointEvent& e = je.jointEvents[i];
			jointI32.insert( jointI32.end(), { e.jointId.index1, (int32_t)e.jointId.world0, (int32_t)e.jointId.generation,
											   (int32_t)(uintptr_t)e.userData } );
		}
	}

	int getContactBeginCount() const { return contactBeginCount; }
	int getContactEndCount() const { return contactEndCount; }
	int getContactHitCount() const { return contactHitCount; }
	int getBodyMoveCount() const { return bodyMoveCount; }
	int getSensorBeginCount() const { return sensorBeginCount; }
	int getSensorEndCount() const { return sensorEndCount; }
	int getJointCount() const { return jointCount; }

	unsigned contactBeginPtr() const { return (unsigned)(size_t)contactBeginI32.data(); }
	unsigned contactEndPtr() const { return (unsigned)(size_t)contactEndI32.data(); }
	unsigned contactHitI32Ptr() const { return (unsigned)(size_t)contactHitI32.data(); }
	unsigned contactHitF64Ptr() const { return (unsigned)(size_t)contactHitF64.data(); }
	unsigned bodyMoveI32Ptr() const { return (unsigned)(size_t)bodyMoveI32.data(); }
	unsigned bodyMoveF64Ptr() const { return (unsigned)(size_t)bodyMoveF64.data(); }
	unsigned sensorBeginPtr() const { return (unsigned)(size_t)sensorBeginI32.data(); }
	unsigned sensorEndPtr() const { return (unsigned)(size_t)sensorEndI32.data(); }
	unsigned jointPtr() const { return (unsigned)(size_t)jointI32.data(); }
};

// ---- per-world persistent callbacks ----------------------------------------
// Box2D keeps one function pointer (and one context) per world for the custom filter,
// pre-solve / pre-continuous, friction and restitution callbacks. The JS function for
// each lives in the world's slot here (b2WorldId.index1 - 1), is replaced when set again,
// and is released when the world is destroyed or a new world takes the slot.
struct WorldCallbacks
{
	val* customFilter = nullptr;
	val* preSolve = nullptr;
	val* preContinuous = nullptr;
	val* friction = nullptr;
	val* restitution = nullptr;
};
WorldCallbacks g_worldCallbacks[B2_MAX_WORLDS];

inline void setHeld( val*& slot, val fn )
{
	delete slot;
	slot = ( fn.isNull() || fn.isUndefined() ) ? nullptr : new val( fn );
}
inline WorldCallbacks& callbacksOf( b2WorldId worldId )
{
	return g_worldCallbacks[worldId.index1 - 1];
}
inline void clearCallbacks( int slot )
{
	WorldCallbacks& c = g_worldCallbacks[slot];
	setHeld( c.customFilter, val::null() );
	setHeld( c.preSolve, val::null() );
	setHeld( c.preContinuous, val::null() );
	setHeld( c.friction, val::null() );
	setHeld( c.restitution, val::null() );
}

bool customFilterTrampoline( b2ShapeId a, b2ShapeId b, void* ctx )
{
	val r = ( *static_cast<val*>( ctx ) )( a, b );
	return r.isUndefined() ? true : r.as<bool>();
}
void preSolveTrampoline( b2ShapeId a, b2ShapeId b, b2Manifold* manifold, void* ctx )
{
	WorldCallbacks* c = static_cast<WorldCallbacks*>( ctx );
	// The manifold goes out as a b2Manifold object and whatever the callback leaves in it
	// comes back: Box2D lets pre-solve edit the manifold (normal, points, pointCount = 0).
	val m( *manifold );
	( *c->preSolve )( a, b, m );
	*manifold = m.as<b2Manifold>();
}
bool preContinuousTrampoline( b2ShapeId a, b2ShapeId b, b2Pos point, b2Vec2 normal, void* ctx )
{
	WorldCallbacks* c = static_cast<WorldCallbacks*>( ctx );
	val r = ( *c->preContinuous )( a, b, point, normal );
	return r.isUndefined() ? true : r.as<bool>();
}

// Friction and restitution callbacks carry no context (Box2D calls them from the solver
// with only the two materials), so each world slot gets its own trampoline instance.
template<int I>
float frictionTrampoline( float frictionA, uint64_t userMaterialIdA, float frictionB, uint64_t userMaterialIdB )
{
	return ( *g_worldCallbacks[I].friction )( frictionA, userMaterialIdA, frictionB, userMaterialIdB ).template as<float>();
}
template<int I>
float restitutionTrampoline( float restitutionA, uint64_t userMaterialIdA, float restitutionB, uint64_t userMaterialIdB )
{
	return ( *g_worldCallbacks[I].restitution )( restitutionA, userMaterialIdA, restitutionB, userMaterialIdB ).template as<float>();
}
template<std::size_t... I>
constexpr std::array<b2FrictionCallback*, sizeof...( I )> makeFrictionTable( std::index_sequence<I...> )
{
	return { { &frictionTrampoline<(int)I>... } };
}
template<std::size_t... I>
constexpr std::array<b2RestitutionCallback*, sizeof...( I )> makeRestitutionTable( std::index_sequence<I...> )
{
	return { { &restitutionTrampoline<(int)I>... } };
}
const auto g_frictionTable = makeFrictionTable( std::make_index_sequence<B2_MAX_WORLDS>{} );
const auto g_restitutionTable = makeRestitutionTable( std::make_index_sequence<B2_MAX_WORLDS>{} );

void setFrictionCallback( b2WorldId worldId, val fn )
{
	int slot = worldId.index1 - 1;
	setHeld( g_worldCallbacks[slot].friction, fn );
	b2World_SetFrictionCallback( worldId, g_worldCallbacks[slot].friction ? g_frictionTable[slot] : nullptr );
}
void setRestitutionCallback( b2WorldId worldId, val fn )
{
	int slot = worldId.index1 - 1;
	setHeld( g_worldCallbacks[slot].restitution, fn );
	b2World_SetRestitutionCallback( worldId, g_worldCallbacks[slot].restitution ? g_restitutionTable[slot] : nullptr );
}

// ---- process-wide callbacks (allocator, assert, log) ----
val* g_allocFcn = nullptr;
val* g_freeFcn = nullptr;
val* g_assertFcn = nullptr;
val* g_logFcn = nullptr;

void* allocTrampoline( size_t size, int alignment )
{
	return reinterpret_cast<void*>( ( *g_allocFcn )( (uintptr_t)size, alignment ).as<uintptr_t>() );
}
void freeTrampoline( void* mem, size_t size )
{
	( *g_freeFcn )( (uintptr_t)mem, (uintptr_t)size );
}
int assertTrampoline( const char* condition, const char* fileName, int lineNumber )
{
	val r = ( *g_assertFcn )( std::string( condition ), std::string( fileName ), lineNumber );
	return r.isUndefined() ? 1 : r.as<int>();
}
void logTrampoline( const char* message )
{
	( *g_logFcn )( std::string( message ) );
}

// ---- simplex cache in/out ----
// b2ShapeDistance and the chain-segment collide functions read and update a b2SimplexCache
// the caller keeps between calls. The JS cache object is read before the call and written
// back after, so it behaves as the C in/out pointer does.
inline b2SimplexCache readCache( const val& c )
{
	return c.isNull() || c.isUndefined() ? b2SimplexCache{} : c.as<b2SimplexCache>();
}
inline void writeCache( val& c, const b2SimplexCache& cache )
{
	if ( c.isNull() || c.isUndefined() ) return;
	val v( cache );
	c.set( "count", v["count"] );
	c.set( "indexA", v["indexA"] );
	c.set( "indexB", v["indexB"] );
}

// ---- collision planes in/out (b2SolvePlanes writes each plane's push) ----
inline std::vector<b2CollisionPlane> readPlanes( const val& planes )
{
	int n = planes["length"].as<int>();
	std::vector<b2CollisionPlane> out;
	out.reserve( n );
	for ( int i = 0; i < n; ++i ) out.push_back( planes[i].as<b2CollisionPlane>() );
	return out;
}

// ---- debug draw ----------------------------------------------------------------
// b2World_Draw takes a b2DebugDraw struct of C function pointers plus flags. The JS
// object is that struct: start from b2DefaultDebugDraw(), set the flags, and add any of
// DrawPolygonFcn, DrawSolidPolygonFcn, DrawCircleFcn, DrawSolidCircleFcn,
// DrawSolidCapsuleFcn, DrawLineFcn, DrawTransformFcn, DrawPointFcn, DrawStringFcn,
// DrawBoundsFcn as functions. Each present function is wired through a trampoline
// with the JS object as the context; absent ones stay NULL. Vertex lists arrive as a
// flat Float32Array copy. This crosses into JS per primitive, so it is for debug and
// inspection, not the render hot path.
struct JsDebugDraw
{
	val handlers;
};
void jsDrawPolygon( b2WorldTransform xf, const b2Vec2* vertices, int vertexCount, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawPolygonFcn", xf, fromPoints( vertices, vertexCount ), vertexCount, (uint32_t)color );
}
void jsDrawSolidPolygon( b2WorldTransform xf, const b2Vec2* vertices, int vertexCount, float radius, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawSolidPolygonFcn", xf, fromPoints( vertices, vertexCount ), vertexCount, radius,
														  (uint32_t)color );
}
void jsDrawCircle( b2Pos center, float radius, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawCircleFcn", center, radius, (uint32_t)color );
}
void jsDrawSolidCircle( b2WorldTransform xf, b2Vec2 center, float radius, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawSolidCircleFcn", xf, center, radius, (uint32_t)color );
}
void jsDrawSolidCapsule( b2Pos p1, b2Pos p2, float radius, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawSolidCapsuleFcn", p1, p2, radius, (uint32_t)color );
}
void jsDrawLine( b2Pos p1, b2Pos p2, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawLineFcn", p1, p2, (uint32_t)color );
}
void jsDrawTransform( b2WorldTransform xf, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawTransformFcn", xf );
}
void jsDrawPoint( b2Pos p, float size, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawPointFcn", p, size, (uint32_t)color );
}
void jsDrawString( b2Pos p, const char* s, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawStringFcn", p, std::string( s ), (uint32_t)color );
}
void jsDrawBounds( b2AABB aabb, b2HexColor color, void* ctx )
{
	static_cast<JsDebugDraw*>( ctx )->handlers.call<void>( "DrawBoundsFcn", aabb, (uint32_t)color );
}

// Build the C b2DebugDraw from the JS object: flags and bounds through the registered
// value_object fields, one trampoline per function the object carries.
inline b2DebugDraw makeDebugDraw( JsDebugDraw& jd )
{
	const val& h = jd.handlers;
	b2DebugDraw dd = h.as<b2DebugDraw>();
	dd.context = &jd;
	auto has = [&]( const char* k ) { return isFn( h[k] ); };
	dd.DrawPolygonFcn = has( "DrawPolygonFcn" ) ? jsDrawPolygon : nullptr;
	dd.DrawSolidPolygonFcn = has( "DrawSolidPolygonFcn" ) ? jsDrawSolidPolygon : nullptr;
	dd.DrawCircleFcn = has( "DrawCircleFcn" ) ? jsDrawCircle : nullptr;
	dd.DrawSolidCircleFcn = has( "DrawSolidCircleFcn" ) ? jsDrawSolidCircle : nullptr;
	dd.DrawSolidCapsuleFcn = has( "DrawSolidCapsuleFcn" ) ? jsDrawSolidCapsule : nullptr;
	dd.DrawLineFcn = has( "DrawLineFcn" ) ? jsDrawLine : nullptr;
	dd.DrawTransformFcn = has( "DrawTransformFcn" ) ? jsDrawTransform : nullptr;
	dd.DrawPointFcn = has( "DrawPointFcn" ) ? jsDrawPoint : nullptr;
	dd.DrawStringFcn = has( "DrawStringFcn" ) ? jsDrawString : nullptr;
	dd.DrawBoundsFcn = has( "DrawBoundsFcn" ) ? jsDrawBounds : nullptr;
	return dd;
}

// Handles: b2Recording* and b2Replay* cross as uintptr_t numbers (box3d.js does the same
// for its recording and player handles); b2DynamicTree is an opaque embind class.
inline b2Recording* asRecording( uintptr_t h ) { return reinterpret_cast<b2Recording*>( h ); }
inline b2Replay* asReplay( uintptr_t h ) { return reinterpret_cast<b2Replay*>( h ); }
} // namespace

EMSCRIPTEN_BINDINGS( box2d )
{
	// ======================================================================
	// Metadata getters (read at build time by scripts/build.mjs, stripped from the
	// shipped module by src/facade.js)
	// ======================================================================

	// Static scratch the facade points the out-param `*Into` readers at.
	function( "b2_getMathScratch", +[]() -> uintptr_t { return reinterpret_cast<uintptr_t>( g_mathScratch ); } );

	// [{method, sizes:[N], trailing:N, tsTypes:["b2Vec2",...]}]
	function( "_outMeta", +[]() -> val {
		val arr = val::array();
		for ( const auto& e : g_outRegistry )
		{
			val o = val::object();
			o.set( "method", val( e.method ) );
			val sizes = val::array();
			for ( int s : e.sizes ) sizes.call<void>( "push", s );
			o.set( "sizes", sizes );
			o.set( "trailing", e.trailing );
			val tsTypes = val::array();
			for ( const auto& t : e.tsTypes ) tsTypes.call<void>( "push", val( t ) );
			o.set( "tsTypes", tsTypes );
			arr.call<void>( "push", o );
		}
		return arr;
	} );

	// [{method, params:[{index, tsType}], tsType}]
	function( "_retMeta", +[]() -> val {
		val arr = val::array();
		for ( const auto& e : g_retRegistry )
		{
			val o = val::object();
			o.set( "method", val( e.method ) );
			val params = val::array();
			for ( size_t k = 0; k < e.paramIndex.size(); ++k )
			{
				val p = val::object();
				p.set( "index", e.paramIndex[k] );
				p.set( "tsType", val( e.paramType[k] ) );
				params.call<void>( "push", p );
			}
			o.set( "params", params );
			o.set( "tsType", val( e.tsType ) );
			arr.call<void>( "push", o );
		}
		return arr;
	} );

	// [{typeName, field, tsType, extra}]
	function( "_fieldMeta", +[]() -> val {
		val arr = val::array();
		for ( const auto& e : g_fieldRegistry )
		{
			val o = val::object();
			o.set( "typeName", val( e.typeName ) );
			o.set( "field", val( e.field ) );
			o.set( "tsType", val( e.tsType ) );
			o.set( "extra", e.extra );
			arr.call<void>( "push", o );
		}
		return arr;
	} );

	// [{name, tsType, live}] — the declarations; the values come from _constants().
	function( "_constMeta", +[]() -> val {
		val arr = val::array();
		for ( const auto& e : g_constRegistry )
		{
			val o = val::object();
			o.set( "name", val( std::string( e.name ) ) );
			o.set( "tsType", val( std::string( e.tsType ) ) );
			o.set( "live", e.live );
			arr.call<void>( "push", o );
		}
		return arr;
	} );
	// { name: value } for the fixed constants; live ones are read through _liveConstant.
	function( "_constants", +[]() -> val {
		val o = val::object();
		for ( const auto& e : g_constRegistry )
			if ( !e.live ) o.set( e.name, e.make() );
		return o;
	} );
	function( "_liveConstant", +[]( std::string name ) -> val {
		for ( const auto& e : g_constRegistry )
			if ( name == e.name ) return e.make();
		return val::undefined();
	} );

	// Packed-record tier strides (see namespace layout). One flat {name: stride} object.
	function( "_layoutMeta", +[]() -> val {
		val o = val::object();
		o.set( "contactI32", layout::contactI32 );
		o.set( "contactF32", layout::contactF32 );
		o.set( "pointI32", layout::pointI32 );
		o.set( "pointF32", layout::pointF32 );
		o.set( "contactTouch", layout::contactTouch );
		o.set( "contactHitI32", layout::contactHitI32 );
		o.set( "contactHitF64", layout::contactHitF64 );
		o.set( "bodyMoveI32", layout::bodyMoveI32 );
		o.set( "bodyMoveF64", layout::bodyMoveF64 );
		o.set( "sensorTouch", layout::sensorTouch );
		o.set( "joint", layout::joint );
		o.set( "plane", layout::plane );
		o.set( "shapeId", layout::shapeId );
		return o;
	} );

	// ======================================================================
	// base.h / math_types.h / id.h value types
	// ======================================================================

	value_object<b2Version>( "b2Version" )
		.field( "major", &b2Version::major )
		.field( "minor", &b2Version::minor )
		.field( "revision", &b2Version::revision );

	// b2Vec2 (and b2Pos, its single-precision alias) -> [x, y]
	value_array<b2Vec2>( "b2Vec2" )
		.element( &b2Vec2::x )
		.element( &b2Vec2::y );

	// b2Rot { c, s } -> [c, s], flattened as box3d.js flattens b3Quat
	value_array<b2Rot>( "b2Rot" )
		.element( &b2Rot::c )
		.element( &b2Rot::s );

	value_object<b2CosSin>( "b2CosSin" )
		.field( "cosine", &b2CosSin::cosine )
		.field( "sine", &b2CosSin::sine );

	// b2Transform (and b2WorldTransform, its single-precision alias) -> { p, q }
	value_object<b2Transform>( "b2Transform" )
		.field( "p", &b2Transform::p )
		.field( "q", &b2Transform::q );

	value_object<b2Mat22>( "b2Mat22" )
		.field( "cx", &b2Mat22::cx )
		.field( "cy", &b2Mat22::cy );

	// b2AABB { lowerBound, upperBound } -> [lowerX, lowerY, upperX, upperY]
	value_array<b2AABB>( "b2AABB" )
		.element( +[]( const b2AABB& a ) { return a.lowerBound.x; }, +[]( b2AABB& a, float v ) { a.lowerBound.x = v; } )
		.element( +[]( const b2AABB& a ) { return a.lowerBound.y; }, +[]( b2AABB& a, float v ) { a.lowerBound.y = v; } )
		.element( +[]( const b2AABB& a ) { return a.upperBound.x; }, +[]( b2AABB& a, float v ) { a.upperBound.x = v; } )
		.element( +[]( const b2AABB& a ) { return a.upperBound.y; }, +[]( b2AABB& a, float v ) { a.upperBound.y = v; } );

	value_object<b2Plane>( "b2Plane" )
		.field( "normal", &b2Plane::normal )
		.field( "offset", &b2Plane::offset );

	value_object<b2WorldId>( "b2WorldId" )
		.field( "index1", &b2WorldId::index1 )
		.field( "generation", &b2WorldId::generation );

	value_object<b2BodyId>( "b2BodyId" )
		.field( "index1", &b2BodyId::index1 )
		.field( "world0", &b2BodyId::world0 )
		.field( "generation", &b2BodyId::generation );

	value_object<b2ShapeId>( "b2ShapeId" )
		.field( "index1", &b2ShapeId::index1 )
		.field( "world0", &b2ShapeId::world0 )
		.field( "generation", &b2ShapeId::generation );

	value_object<b2ChainId>( "b2ChainId" )
		.field( "index1", &b2ChainId::index1 )
		.field( "world0", &b2ChainId::world0 )
		.field( "generation", &b2ChainId::generation );

	value_object<b2JointId>( "b2JointId" )
		.field( "index1", &b2JointId::index1 )
		.field( "world0", &b2JointId::world0 )
		.field( "generation", &b2JointId::generation );

	value_object<b2ContactId>( "b2ContactId" )
		.field( "index1", &b2ContactId::index1 )
		.field( "world0", &b2ContactId::world0 )
		.field( "padding", &b2ContactId::padding )
		.field( "generation", &b2ContactId::generation );

	// ======================================================================
	// collision.h value types
	// ======================================================================

	value_object<b2RayCastInput>( "b2RayCastInput" )
		.field( "origin", &b2RayCastInput::origin )
		.field( "translation", &b2RayCastInput::translation )
		.field( "maxFraction", &b2RayCastInput::maxFraction );

	{
		value_object<b2ShapeProxy> o( "b2ShapeProxy" );
		val_field( o, "b2ShapeProxy", "points", "ArrayLike<number>",
			+[]( const b2ShapeProxy& p ) { return fromPoints( p.points, p.count ); },
			+[]( b2ShapeProxy& p, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				std::vector<b2Vec2> pts = toPoints( v );
				int n = (int)pts.size() < B2_MAX_POLYGON_VERTICES ? (int)pts.size() : B2_MAX_POLYGON_VERTICES;
				for ( int i = 0; i < n; ++i ) p.points[i] = pts[i];
			} );
		o.field( "count", &b2ShapeProxy::count );
		o.field( "radius", &b2ShapeProxy::radius );
	}

	value_object<b2ShapeCastInput>( "b2ShapeCastInput" )
		.field( "proxy", &b2ShapeCastInput::proxy )
		.field( "translation", &b2ShapeCastInput::translation )
		.field( "maxFraction", &b2ShapeCastInput::maxFraction )
		.field( "canEncroach", &b2ShapeCastInput::canEncroach );

	// b2CastOutput (and b2WorldCastOutput, its single-precision alias)
	value_object<b2CastOutput>( "b2CastOutput" )
		.field( "normal", &b2CastOutput::normal )
		.field( "point", &b2CastOutput::point )
		.field( "fraction", &b2CastOutput::fraction )
		.field( "iterations", &b2CastOutput::iterations )
		.field( "hit", &b2CastOutput::hit );

	value_object<b2MassData>( "b2MassData" )
		.field( "mass", &b2MassData::mass )
		.field( "center", &b2MassData::center )
		.field( "rotationalInertia", &b2MassData::rotationalInertia );

	value_object<b2Circle>( "b2Circle" )
		.field( "center", &b2Circle::center )
		.field( "radius", &b2Circle::radius );

	value_object<b2Capsule>( "b2Capsule" )
		.field( "center1", &b2Capsule::center1 )
		.field( "center2", &b2Capsule::center2 )
		.field( "radius", &b2Capsule::radius );

	{
		value_object<b2Polygon> o( "b2Polygon" );
		val_field( o, "b2Polygon", "vertices", "ArrayLike<number>",
			+[]( const b2Polygon& p ) { return fromPoints( p.vertices, p.count ); },
			+[]( b2Polygon& p, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				std::vector<b2Vec2> pts = toPoints( v );
				int n = (int)pts.size() < B2_MAX_POLYGON_VERTICES ? (int)pts.size() : B2_MAX_POLYGON_VERTICES;
				for ( int i = 0; i < n; ++i ) p.vertices[i] = pts[i];
			} );
		val_field( o, "b2Polygon", "normals", "ArrayLike<number>",
			+[]( const b2Polygon& p ) { return fromPoints( p.normals, p.count ); },
			+[]( b2Polygon& p, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				std::vector<b2Vec2> pts = toPoints( v );
				int n = (int)pts.size() < B2_MAX_POLYGON_VERTICES ? (int)pts.size() : B2_MAX_POLYGON_VERTICES;
				for ( int i = 0; i < n; ++i ) p.normals[i] = pts[i];
			} );
		o.field( "centroid", &b2Polygon::centroid );
		o.field( "radius", &b2Polygon::radius );
		o.field( "count", &b2Polygon::count );
	}

	value_object<b2Segment>( "b2Segment" )
		.field( "point1", &b2Segment::point1 )
		.field( "point2", &b2Segment::point2 );

	value_object<b2ChainSegment>( "b2ChainSegment" )
		.field( "ghost1", &b2ChainSegment::ghost1 )
		.field( "segment", &b2ChainSegment::segment )
		.field( "ghost2", &b2ChainSegment::ghost2 )
		.field( "chainId", &b2ChainSegment::chainId );

	{
		value_object<b2Hull> o( "b2Hull" );
		val_field( o, "b2Hull", "points", "ArrayLike<number>",
			+[]( const b2Hull& h ) { return fromPoints( h.points, h.count ); },
			+[]( b2Hull& h, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				std::vector<b2Vec2> pts = toPoints( v );
				int n = (int)pts.size() < B2_MAX_POLYGON_VERTICES ? (int)pts.size() : B2_MAX_POLYGON_VERTICES;
				for ( int i = 0; i < n; ++i ) h.points[i] = pts[i];
			} );
		o.field( "count", &b2Hull::count );
	}

	value_object<b2SegmentDistanceResult>( "b2SegmentDistanceResult" )
		.field( "closest1", &b2SegmentDistanceResult::closest1 )
		.field( "closest2", &b2SegmentDistanceResult::closest2 )
		.field( "fraction1", &b2SegmentDistanceResult::fraction1 )
		.field( "fraction2", &b2SegmentDistanceResult::fraction2 )
		.field( "distanceSquared", &b2SegmentDistanceResult::distanceSquared );

	{
		value_object<b2SimplexCache> o( "b2SimplexCache" );
		o.field( "count", &b2SimplexCache::count );
		val_field( o, "b2SimplexCache", "indexA", "number[]",
			+[]( const b2SimplexCache& c ) { int v[3] = { c.indexA[0], c.indexA[1], c.indexA[2] }; return numberArray( v, 3 ); },
			+[]( b2SimplexCache& c, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				for ( int i = 0; i < 3; ++i ) c.indexA[i] = (uint8_t)v[i].as<int>();
			} );
		val_field( o, "b2SimplexCache", "indexB", "number[]",
			+[]( const b2SimplexCache& c ) { int v[3] = { c.indexB[0], c.indexB[1], c.indexB[2] }; return numberArray( v, 3 ); },
			+[]( b2SimplexCache& c, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				for ( int i = 0; i < 3; ++i ) c.indexB[i] = (uint8_t)v[i].as<int>();
			} );
	}

	value_object<b2DistanceInput>( "b2DistanceInput" )
		.field( "proxyA", &b2DistanceInput::proxyA )
		.field( "proxyB", &b2DistanceInput::proxyB )
		.field( "transform", &b2DistanceInput::transform )
		.field( "useRadii", &b2DistanceInput::useRadii );

	value_object<b2DistanceOutput>( "b2DistanceOutput" )
		.field( "pointA", &b2DistanceOutput::pointA )
		.field( "pointB", &b2DistanceOutput::pointB )
		.field( "normal", &b2DistanceOutput::normal )
		.field( "distance", &b2DistanceOutput::distance )
		.field( "iterations", &b2DistanceOutput::iterations )
		.field( "simplexCount", &b2DistanceOutput::simplexCount );

	value_object<b2SimplexVertex>( "b2SimplexVertex" )
		.field( "wA", &b2SimplexVertex::wA )
		.field( "wB", &b2SimplexVertex::wB )
		.field( "w", &b2SimplexVertex::w )
		.field( "a", &b2SimplexVertex::a )
		.field( "indexA", &b2SimplexVertex::indexA )
		.field( "indexB", &b2SimplexVertex::indexB );

	value_object<b2Simplex>( "b2Simplex" )
		.field( "v1", &b2Simplex::v1 )
		.field( "v2", &b2Simplex::v2 )
		.field( "v3", &b2Simplex::v3 )
		.field( "count", &b2Simplex::count );

	value_object<b2ShapeCastPairInput>( "b2ShapeCastPairInput" )
		.field( "proxyA", &b2ShapeCastPairInput::proxyA )
		.field( "proxyB", &b2ShapeCastPairInput::proxyB )
		.field( "transform", &b2ShapeCastPairInput::transform )
		.field( "translationB", &b2ShapeCastPairInput::translationB )
		.field( "maxFraction", &b2ShapeCastPairInput::maxFraction )
		.field( "canEncroach", &b2ShapeCastPairInput::canEncroach );

	value_object<b2Sweep>( "b2Sweep" )
		.field( "localCenter", &b2Sweep::localCenter )
		.field( "c1", &b2Sweep::c1 )
		.field( "c2", &b2Sweep::c2 )
		.field( "q1", &b2Sweep::q1 )
		.field( "q2", &b2Sweep::q2 );

	value_object<b2TOIInput>( "b2TOIInput" )
		.field( "proxyA", &b2TOIInput::proxyA )
		.field( "proxyB", &b2TOIInput::proxyB )
		.field( "sweepA", &b2TOIInput::sweepA )
		.field( "sweepB", &b2TOIInput::sweepB )
		.field( "maxFraction", &b2TOIInput::maxFraction );

	enum_<b2TOIState>( "b2TOIState" )
		.value( "b2_toiStateUnknown", b2_toiStateUnknown )
		.value( "b2_toiStateFailed", b2_toiStateFailed )
		.value( "b2_toiStateOverlapped", b2_toiStateOverlapped )
		.value( "b2_toiStateHit", b2_toiStateHit )
		.value( "b2_toiStateSeparated", b2_toiStateSeparated );

	value_object<b2TOIOutput>( "b2TOIOutput" )
		.field( "state", &b2TOIOutput::state )
		.field( "point", &b2TOIOutput::point )
		.field( "normal", &b2TOIOutput::normal )
		.field( "fraction", &b2TOIOutput::fraction );

	value_object<b2ManifoldPoint>( "b2ManifoldPoint" )
		.field( "anchorA", &b2ManifoldPoint::anchorA )
		.field( "anchorB", &b2ManifoldPoint::anchorB )
		.field( "separation", &b2ManifoldPoint::separation )
		.field( "normalImpulse", &b2ManifoldPoint::normalImpulse )
		.field( "tangentImpulse", &b2ManifoldPoint::tangentImpulse )
		.field( "totalNormalImpulse", &b2ManifoldPoint::totalNormalImpulse )
		.field( "normalVelocity", &b2ManifoldPoint::normalVelocity )
		.field( "baseSeparation", &b2ManifoldPoint::baseSeparation )
		.field( "id", &b2ManifoldPoint::id )
		.field( "persisted", &b2ManifoldPoint::persisted );

	{
		value_object<b2Manifold> o( "b2Manifold" );
		o.field( "normal", &b2Manifold::normal );
		o.field( "rollingImpulse", &b2Manifold::rollingImpulse );
		val_field( o, "b2Manifold", "points", "b2ManifoldPoint[]",
			+[]( const b2Manifold& m )
			{
				val a = val::array();
				for ( int i = 0; i < m.pointCount && i < 2; ++i ) a.call<void>( "push", val( m.points[i] ) );
				return a;
			},
			+[]( b2Manifold& m, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				int n = v["length"].as<int>();
				for ( int i = 0; i < n && i < 2; ++i ) m.points[i] = v[i].as<b2ManifoldPoint>();
			} );
		o.field( "pointCount", &b2Manifold::pointCount );
	}

	value_object<b2LocalManifoldPoint>( "b2LocalManifoldPoint" )
		.field( "point", &b2LocalManifoldPoint::point )
		.field( "separation", &b2LocalManifoldPoint::separation )
		.field( "id", &b2LocalManifoldPoint::id );

	{
		value_object<b2LocalManifold> o( "b2LocalManifold" );
		o.field( "normal", &b2LocalManifold::normal );
		val_field( o, "b2LocalManifold", "points", "b2LocalManifoldPoint[]",
			+[]( const b2LocalManifold& m )
			{
				val a = val::array();
				for ( int i = 0; i < m.pointCount && i < 2; ++i ) a.call<void>( "push", val( m.points[i] ) );
				return a;
			},
			+[]( b2LocalManifold& m, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				int n = v["length"].as<int>();
				for ( int i = 0; i < n && i < 2; ++i ) m.points[i] = v[i].as<b2LocalManifoldPoint>();
			} );
		o.field( "pointCount", &b2LocalManifold::pointCount );
	}

	value_object<b2TreeStats>( "b2TreeStats" )
		.field( "nodeVisits", &b2TreeStats::nodeVisits )
		.field( "leafVisits", &b2TreeStats::leafVisits );

	value_object<b2BoxCastInput>( "b2BoxCastInput" )
		.field( "box", &b2BoxCastInput::box )
		.field( "translation", &b2BoxCastInput::translation )
		.field( "maxFraction", &b2BoxCastInput::maxFraction );

	value_object<b2PlaneResult>( "b2PlaneResult" )
		.field( "plane", &b2PlaneResult::plane )
		.field( "point", &b2PlaneResult::point )
		.field( "hit", &b2PlaneResult::hit );

	value_object<b2CollisionPlane>( "b2CollisionPlane" )
		.field( "plane", &b2CollisionPlane::plane )
		.field( "pushLimit", &b2CollisionPlane::pushLimit )
		.field( "push", &b2CollisionPlane::push )
		.field( "clipVelocity", &b2CollisionPlane::clipVelocity );

	value_object<b2PlaneSolverResult>( "b2PlaneSolverResult" )
		.field( "delta", &b2PlaneSolverResult::delta )
		.field( "iterationCount", &b2PlaneSolverResult::iterationCount );

	// ======================================================================
	// types.h value types and enums
	// ======================================================================

	value_object<b2RayResult>( "b2RayResult" )
		.field( "shapeId", &b2RayResult::shapeId )
		.field( "point", &b2RayResult::point )
		.field( "normal", &b2RayResult::normal )
		.field( "fraction", &b2RayResult::fraction )
		.field( "nodeVisits", &b2RayResult::nodeVisits )
		.field( "leafVisits", &b2RayResult::leafVisits )
		.field( "hit", &b2RayResult::hit );

	value_object<b2Capacity>( "b2Capacity" )
		.field( "staticShapeCount", &b2Capacity::staticShapeCount )
		.field( "dynamicShapeCount", &b2Capacity::dynamicShapeCount )
		.field( "staticBodyCount", &b2Capacity::staticBodyCount )
		.field( "dynamicBodyCount", &b2Capacity::dynamicBodyCount )
		.field( "contactCount", &b2Capacity::contactCount );

	// frictionCallback / restitutionCallback are read off the def by b2CreateWorld (extra
	// fields below); enqueueTask / finishTask / userTaskContext are not exposed (file header).
	value_object<b2WorldDef>( "b2WorldDef" )
		.field( "gravity", &b2WorldDef::gravity )
		.field( "restitutionThreshold", &b2WorldDef::restitutionThreshold )
		.field( "restitutionIterations", &b2WorldDef::restitutionIterations )
		.field( "enableRestitutionPropagation", &b2WorldDef::enableRestitutionPropagation )
		.field( "hitEventThreshold", &b2WorldDef::hitEventThreshold )
		.field( "contactHertz", &b2WorldDef::contactHertz )
		.field( "contactDampingRatio", &b2WorldDef::contactDampingRatio )
		.field( "contactSpeed", &b2WorldDef::contactSpeed )
		.field( "maximumLinearSpeed", &b2WorldDef::maximumLinearSpeed )
		.field( "enableSleep", &b2WorldDef::enableSleep )
		.field( "enableContinuous", &b2WorldDef::enableContinuous )
		.field( "workerCount", &b2WorldDef::workerCount )
		.field( "userData", +[]( const b2WorldDef& d ) { return (uintptr_t)d.userData; }, +[]( b2WorldDef& d, uintptr_t v ) { d.userData = (void*)v; } )
		.field( "capacity", &b2WorldDef::capacity )
		.field( "internalValue", &b2WorldDef::internalValue );
	extra_field( "b2WorldDef", "frictionCallback",
		"((frictionA: number, userMaterialIdA: bigint, frictionB: number, userMaterialIdB: bigint) => number) | null" );
	extra_field( "b2WorldDef", "restitutionCallback",
		"((restitutionA: number, userMaterialIdA: bigint, restitutionB: number, userMaterialIdB: bigint) => number) | null" );

	enum_<b2BodyType>( "b2BodyType" )
		.value( "b2_staticBody", b2_staticBody )
		.value( "b2_kinematicBody", b2_kinematicBody )
		.value( "b2_dynamicBody", b2_dynamicBody )
		.value( "b2_bodyTypeCount", b2_bodyTypeCount );

	value_object<b2MotionLocks>( "b2MotionLocks" )
		.field( "linearX", &b2MotionLocks::linearX )
		.field( "linearY", &b2MotionLocks::linearY )
		.field( "angularZ", &b2MotionLocks::angularZ );

	// name is read off the def by b2CreateBody (extra field below).
	value_object<b2BodyDef>( "b2BodyDef" )
		.field( "type", &b2BodyDef::type )
		.field( "position", &b2BodyDef::position )
		.field( "rotation", &b2BodyDef::rotation )
		.field( "linearVelocity", &b2BodyDef::linearVelocity )
		.field( "angularVelocity", &b2BodyDef::angularVelocity )
		.field( "linearDamping", &b2BodyDef::linearDamping )
		.field( "angularDamping", &b2BodyDef::angularDamping )
		.field( "gravityScale", &b2BodyDef::gravityScale )
		.field( "sleepThreshold", &b2BodyDef::sleepThreshold )
		.field( "safetyFactor", &b2BodyDef::safetyFactor )
		.field( "userData", +[]( const b2BodyDef& d ) { return (uintptr_t)d.userData; }, +[]( b2BodyDef& d, uintptr_t v ) { d.userData = (void*)v; } )
		.field( "motionLocks", &b2BodyDef::motionLocks )
		.field( "enableSleep", &b2BodyDef::enableSleep )
		.field( "isAwake", &b2BodyDef::isAwake )
		.field( "isBullet", &b2BodyDef::isBullet )
		.field( "isEnabled", &b2BodyDef::isEnabled )
		.field( "allowFastRotation", &b2BodyDef::allowFastRotation )
		.field( "enableContactRecycling", &b2BodyDef::enableContactRecycling )
		.field( "internalValue", &b2BodyDef::internalValue );
	extra_field( "b2BodyDef", "name", "string | null" );

	value_object<b2Filter>( "b2Filter" )
		.field( "categoryBits", &b2Filter::categoryBits )
		.field( "maskBits", &b2Filter::maskBits )
		.field( "groupIndex", &b2Filter::groupIndex );

	value_object<b2QueryFilter>( "b2QueryFilter" )
		.field( "categoryBits", &b2QueryFilter::categoryBits )
		.field( "maskBits", &b2QueryFilter::maskBits );

	enum_<b2ShapeType>( "b2ShapeType" )
		.value( "b2_circleShape", b2_circleShape )
		.value( "b2_capsuleShape", b2_capsuleShape )
		.value( "b2_segmentShape", b2_segmentShape )
		.value( "b2_polygonShape", b2_polygonShape )
		.value( "b2_chainSegmentShape", b2_chainSegmentShape )
		.value( "b2_shapeTypeCount", b2_shapeTypeCount );

	value_object<b2SurfaceMaterial>( "b2SurfaceMaterial" )
		.field( "friction", &b2SurfaceMaterial::friction )
		.field( "restitution", &b2SurfaceMaterial::restitution )
		.field( "rollingResistance", &b2SurfaceMaterial::rollingResistance )
		.field( "tangentSpeed", &b2SurfaceMaterial::tangentSpeed )
		.field( "userMaterialId", &b2SurfaceMaterial::userMaterialId )
		.field( "customColor", &b2SurfaceMaterial::customColor );

	value_object<b2ShapeDef>( "b2ShapeDef" )
		.field( "userData", +[]( const b2ShapeDef& d ) { return (uintptr_t)d.userData; }, +[]( b2ShapeDef& d, uintptr_t v ) { d.userData = (void*)v; } )
		.field( "material", &b2ShapeDef::material )
		.field( "density", &b2ShapeDef::density )
		.field( "filter", &b2ShapeDef::filter )
		.field( "enableCustomFiltering", &b2ShapeDef::enableCustomFiltering )
		.field( "isSensor", &b2ShapeDef::isSensor )
		.field( "enableSensorEvents", &b2ShapeDef::enableSensorEvents )
		.field( "enableContactEvents", &b2ShapeDef::enableContactEvents )
		.field( "enableHitEvents", &b2ShapeDef::enableHitEvents )
		.field( "enablePreSolveEvents", &b2ShapeDef::enablePreSolveEvents )
		.field( "invokeContactCreation", &b2ShapeDef::invokeContactCreation )
		.field( "updateBodyMass", &b2ShapeDef::updateBodyMass )
		.field( "internalValue", &b2ShapeDef::internalValue );

	// points / materials are read off the def by b2CreateChain (extra fields below);
	// pointCount / materialCount are their lengths.
	value_object<b2ChainDef>( "b2ChainDef" )
		.field( "userData", +[]( const b2ChainDef& d ) { return (uintptr_t)d.userData; }, +[]( b2ChainDef& d, uintptr_t v ) { d.userData = (void*)v; } )
		.field( "ghost1", &b2ChainDef::ghost1 )
		.field( "ghost2", &b2ChainDef::ghost2 )
		.field( "filter", &b2ChainDef::filter )
		.field( "isLoop", &b2ChainDef::isLoop )
		.field( "enableSensorEvents", &b2ChainDef::enableSensorEvents )
		.field( "internalValue", &b2ChainDef::internalValue );
	extra_field( "b2ChainDef", "points", "ArrayLike<number>" );
	extra_field( "b2ChainDef", "materials", "b2SurfaceMaterial[]" );

	value_object<b2Profile>( "b2Profile" )
		.field( "step", &b2Profile::step )
		.field( "pairs", &b2Profile::pairs )
		.field( "collide", &b2Profile::collide )
		.field( "solve", &b2Profile::solve )
		.field( "solverSetup", &b2Profile::solverSetup )
		.field( "constraints", &b2Profile::constraints )
		.field( "prepareConstraints", &b2Profile::prepareConstraints )
		.field( "integrateVelocities", &b2Profile::integrateVelocities )
		.field( "warmStart", &b2Profile::warmStart )
		.field( "solveImpulses", &b2Profile::solveImpulses )
		.field( "integratePositions", &b2Profile::integratePositions )
		.field( "relaxImpulses", &b2Profile::relaxImpulses )
		.field( "restitution", &b2Profile::restitution )
		.field( "storeImpulses", &b2Profile::storeImpulses )
		.field( "splitIslands", &b2Profile::splitIslands )
		.field( "transforms", &b2Profile::transforms )
		.field( "sensorHits", &b2Profile::sensorHits )
		.field( "jointEvents", &b2Profile::jointEvents )
		.field( "hitEvents", &b2Profile::hitEvents )
		.field( "refit", &b2Profile::refit )
		.field( "bullets", &b2Profile::bullets )
		.field( "sleepIslands", &b2Profile::sleepIslands )
		.field( "sensors", &b2Profile::sensors );

	{
		value_object<b2Counters> o( "b2Counters" );
		o.field( "byteCount", &b2Counters::byteCount );
		o.field( "bodyCount", &b2Counters::bodyCount );
		o.field( "shapeCount", &b2Counters::shapeCount );
		o.field( "contactCount", &b2Counters::contactCount );
		o.field( "jointCount", &b2Counters::jointCount );
		o.field( "islandCount", &b2Counters::islandCount );
		o.field( "stackUsed", &b2Counters::stackUsed );
		o.field( "staticTreeHeight", &b2Counters::staticTreeHeight );
		o.field( "treeHeight", &b2Counters::treeHeight );
		o.field( "taskCount", &b2Counters::taskCount );
		val_field( o, "b2Counters", "colorCounts", "number[]",
			+[]( const b2Counters& c ) { return numberArray( c.colorCounts, 24 ); },
			+[]( b2Counters& c, val v )
			{
				if ( v.isUndefined() || v.isNull() ) return;
				int n = v["length"].as<int>();
				for ( int i = 0; i < n && i < 24; ++i ) c.colorCounts[i] = v[i].as<int>();
			} );
		o.field( "awakeContactCount", &b2Counters::awakeContactCount );
		o.field( "recycledContactCount", &b2Counters::recycledContactCount );
	}

	enum_<b2JointType>( "b2JointType" )
		.value( "b2_distanceJoint", b2_distanceJoint )
		.value( "b2_filterJoint", b2_filterJoint )
		.value( "b2_motorJoint", b2_motorJoint )
		.value( "b2_moverJoint", b2_moverJoint )
		.value( "b2_pogoJoint", b2_pogoJoint )
		.value( "b2_prismaticJoint", b2_prismaticJoint )
		.value( "b2_revoluteJoint", b2_revoluteJoint )
		.value( "b2_weldJoint", b2_weldJoint )
		.value( "b2_wheelJoint", b2_wheelJoint );

	value_object<b2JointDef>( "b2JointDef" )
		.field( "userData", +[]( const b2JointDef& d ) { return (uintptr_t)d.userData; }, +[]( b2JointDef& d, uintptr_t v ) { d.userData = (void*)v; } )
		.field( "bodyIdA", &b2JointDef::bodyIdA )
		.field( "bodyIdB", &b2JointDef::bodyIdB )
		.field( "localFrameA", &b2JointDef::localFrameA )
		.field( "localFrameB", &b2JointDef::localFrameB )
		.field( "forceThreshold", &b2JointDef::forceThreshold )
		.field( "torqueThreshold", &b2JointDef::torqueThreshold )
		.field( "constraintHertz", &b2JointDef::constraintHertz )
		.field( "constraintDampingRatio", &b2JointDef::constraintDampingRatio )
		.field( "drawScale", &b2JointDef::drawScale )
		.field( "collideConnected", &b2JointDef::collideConnected );

	value_object<b2DistanceJointDef>( "b2DistanceJointDef" )
		.field( "base", &b2DistanceJointDef::base )
		.field( "length", &b2DistanceJointDef::length )
		.field( "enableSpring", &b2DistanceJointDef::enableSpring )
		.field( "lowerSpringForce", &b2DistanceJointDef::lowerSpringForce )
		.field( "upperSpringForce", &b2DistanceJointDef::upperSpringForce )
		.field( "hertz", &b2DistanceJointDef::hertz )
		.field( "dampingRatio", &b2DistanceJointDef::dampingRatio )
		.field( "enableLimit", &b2DistanceJointDef::enableLimit )
		.field( "minLength", &b2DistanceJointDef::minLength )
		.field( "maxLength", &b2DistanceJointDef::maxLength )
		.field( "enableMotor", &b2DistanceJointDef::enableMotor )
		.field( "maxMotorForce", &b2DistanceJointDef::maxMotorForce )
		.field( "motorSpeed", &b2DistanceJointDef::motorSpeed )
		.field( "internalValue", &b2DistanceJointDef::internalValue );

	value_object<b2FilterJointDef>( "b2FilterJointDef" )
		.field( "base", &b2FilterJointDef::base )
		.field( "internalValue", &b2FilterJointDef::internalValue );

	value_object<b2MotorJointDef>( "b2MotorJointDef" )
		.field( "base", &b2MotorJointDef::base )
		.field( "linearVelocity", &b2MotorJointDef::linearVelocity )
		.field( "maxVelocityForce", &b2MotorJointDef::maxVelocityForce )
		.field( "angularVelocity", &b2MotorJointDef::angularVelocity )
		.field( "maxVelocityTorque", &b2MotorJointDef::maxVelocityTorque )
		.field( "linearHertz", &b2MotorJointDef::linearHertz )
		.field( "linearDampingRatio", &b2MotorJointDef::linearDampingRatio )
		.field( "maxSpringForce", &b2MotorJointDef::maxSpringForce )
		.field( "angularHertz", &b2MotorJointDef::angularHertz )
		.field( "angularDampingRatio", &b2MotorJointDef::angularDampingRatio )
		.field( "maxSpringTorque", &b2MotorJointDef::maxSpringTorque )
		.field( "internalValue", &b2MotorJointDef::internalValue );

	value_object<b2MoverJointDef>( "b2MoverJointDef" )
		.field( "base", &b2MoverJointDef::base )
		.field( "linearVelocity", &b2MoverJointDef::linearVelocity )
		.field( "maxVelocityForce", &b2MoverJointDef::maxVelocityForce )
		.field( "internalValue", &b2MoverJointDef::internalValue );

	value_object<b2PogoJointDef>( "b2PogoJointDef" )
		.field( "base", &b2PogoJointDef::base )
		.field( "normal", &b2PogoJointDef::normal )
		.field( "hertz", &b2PogoJointDef::hertz )
		.field( "dampingRatio", &b2PogoJointDef::dampingRatio )
		.field( "restLength", &b2PogoJointDef::restLength )
		.field( "maxTensionForce", &b2PogoJointDef::maxTensionForce )
		.field( "maxCompressionForce", &b2PogoJointDef::maxCompressionForce )
		.field( "impulse", &b2PogoJointDef::impulse )
		.field( "velocity", &b2PogoJointDef::velocity )
		.field( "internalValue", &b2PogoJointDef::internalValue );

	value_object<b2PrismaticJointDef>( "b2PrismaticJointDef" )
		.field( "base", &b2PrismaticJointDef::base )
		.field( "enableSpring", &b2PrismaticJointDef::enableSpring )
		.field( "hertz", &b2PrismaticJointDef::hertz )
		.field( "dampingRatio", &b2PrismaticJointDef::dampingRatio )
		.field( "targetTranslation", &b2PrismaticJointDef::targetTranslation )
		.field( "enableLimit", &b2PrismaticJointDef::enableLimit )
		.field( "lowerTranslation", &b2PrismaticJointDef::lowerTranslation )
		.field( "upperTranslation", &b2PrismaticJointDef::upperTranslation )
		.field( "enableMotor", &b2PrismaticJointDef::enableMotor )
		.field( "maxMotorForce", &b2PrismaticJointDef::maxMotorForce )
		.field( "motorSpeed", &b2PrismaticJointDef::motorSpeed )
		.field( "internalValue", &b2PrismaticJointDef::internalValue );

	value_object<b2RevoluteJointDef>( "b2RevoluteJointDef" )
		.field( "base", &b2RevoluteJointDef::base )
		.field( "targetAngle", &b2RevoluteJointDef::targetAngle )
		.field( "enableSpring", &b2RevoluteJointDef::enableSpring )
		.field( "hertz", &b2RevoluteJointDef::hertz )
		.field( "dampingRatio", &b2RevoluteJointDef::dampingRatio )
		.field( "enableLimit", &b2RevoluteJointDef::enableLimit )
		.field( "lowerAngle", &b2RevoluteJointDef::lowerAngle )
		.field( "upperAngle", &b2RevoluteJointDef::upperAngle )
		.field( "enableMotor", &b2RevoluteJointDef::enableMotor )
		.field( "maxMotorTorque", &b2RevoluteJointDef::maxMotorTorque )
		.field( "motorSpeed", &b2RevoluteJointDef::motorSpeed )
		.field( "internalValue", &b2RevoluteJointDef::internalValue );

	value_object<b2WeldJointDef>( "b2WeldJointDef" )
		.field( "base", &b2WeldJointDef::base )
		.field( "linearHertz", &b2WeldJointDef::linearHertz )
		.field( "angularHertz", &b2WeldJointDef::angularHertz )
		.field( "linearDampingRatio", &b2WeldJointDef::linearDampingRatio )
		.field( "angularDampingRatio", &b2WeldJointDef::angularDampingRatio )
		.field( "internalValue", &b2WeldJointDef::internalValue );

	value_object<b2WheelJointDef>( "b2WheelJointDef" )
		.field( "base", &b2WheelJointDef::base )
		.field( "enableSpring", &b2WheelJointDef::enableSpring )
		.field( "hertz", &b2WheelJointDef::hertz )
		.field( "dampingRatio", &b2WheelJointDef::dampingRatio )
		.field( "enableLimit", &b2WheelJointDef::enableLimit )
		.field( "lowerTranslation", &b2WheelJointDef::lowerTranslation )
		.field( "upperTranslation", &b2WheelJointDef::upperTranslation )
		.field( "enableMotor", &b2WheelJointDef::enableMotor )
		.field( "maxMotorTorque", &b2WheelJointDef::maxMotorTorque )
		.field( "motorSpeed", &b2WheelJointDef::motorSpeed )
		.field( "internalValue", &b2WheelJointDef::internalValue );

	value_object<b2ExplosionDef>( "b2ExplosionDef" )
		.field( "maskBits", &b2ExplosionDef::maskBits )
		.field( "position", &b2ExplosionDef::position )
		.field( "radius", &b2ExplosionDef::radius )
		.field( "falloff", &b2ExplosionDef::falloff )
		.field( "impulsePerLength", &b2ExplosionDef::impulsePerLength );

	// Event records. Per-step events are read through the events buffer (createEventsBuffer
	// / getEvents / get*EventAt in src/facade.js), which fills objects of these shapes.
	value_object<b2SensorBeginTouchEvent>( "b2SensorBeginTouchEvent" )
		.field( "sensorShapeId", &b2SensorBeginTouchEvent::sensorShapeId )
		.field( "visitorShapeId", &b2SensorBeginTouchEvent::visitorShapeId );

	value_object<b2SensorEndTouchEvent>( "b2SensorEndTouchEvent" )
		.field( "sensorShapeId", &b2SensorEndTouchEvent::sensorShapeId )
		.field( "visitorShapeId", &b2SensorEndTouchEvent::visitorShapeId );

	value_object<b2ContactBeginTouchEvent>( "b2ContactBeginTouchEvent" )
		.field( "shapeIdA", &b2ContactBeginTouchEvent::shapeIdA )
		.field( "shapeIdB", &b2ContactBeginTouchEvent::shapeIdB )
		.field( "contactId", &b2ContactBeginTouchEvent::contactId );

	value_object<b2ContactEndTouchEvent>( "b2ContactEndTouchEvent" )
		.field( "shapeIdA", &b2ContactEndTouchEvent::shapeIdA )
		.field( "shapeIdB", &b2ContactEndTouchEvent::shapeIdB )
		.field( "contactId", &b2ContactEndTouchEvent::contactId );

	value_object<b2ContactHitEvent>( "b2ContactHitEvent" )
		.field( "shapeIdA", &b2ContactHitEvent::shapeIdA )
		.field( "shapeIdB", &b2ContactHitEvent::shapeIdB )
		.field( "contactId", &b2ContactHitEvent::contactId )
		.field( "point", &b2ContactHitEvent::point )
		.field( "normal", &b2ContactHitEvent::normal )
		.field( "approachSpeed", &b2ContactHitEvent::approachSpeed );

	value_object<b2BodyMoveEvent>( "b2BodyMoveEvent" )
		.field( "userData", +[]( const b2BodyMoveEvent& e ) { return (uintptr_t)e.userData; }, +[]( b2BodyMoveEvent& e, uintptr_t v ) { e.userData = (void*)v; } )
		.field( "transform", &b2BodyMoveEvent::transform )
		.field( "bodyId", &b2BodyMoveEvent::bodyId )
		.field( "fellAsleep", &b2BodyMoveEvent::fellAsleep );

	value_object<b2JointEvent>( "b2JointEvent" )
		.field( "jointId", &b2JointEvent::jointId )
		.field( "userData", +[]( const b2JointEvent& e ) { return (uintptr_t)e.userData; }, +[]( b2JointEvent& e, uintptr_t v ) { e.userData = (void*)v; } );

	value_object<b2ContactData>( "b2ContactData" )
		.field( "contactId", &b2ContactData::contactId )
		.field( "shapeIdA", &b2ContactData::shapeIdA )
		.field( "shapeIdB", &b2ContactData::shapeIdB )
		.field( "manifold", &b2ContactData::manifold );

	enum_<b2HexColor>( "b2HexColor" )
		.value( "b2_colorAliceBlue", b2_colorAliceBlue )
		.value( "b2_colorAntiqueWhite", b2_colorAntiqueWhite )
		.value( "b2_colorAqua", b2_colorAqua )
		.value( "b2_colorAquamarine", b2_colorAquamarine )
		.value( "b2_colorAzure", b2_colorAzure )
		.value( "b2_colorBeige", b2_colorBeige )
		.value( "b2_colorBisque", b2_colorBisque )
		.value( "b2_colorBlack", b2_colorBlack )
		.value( "b2_colorBlanchedAlmond", b2_colorBlanchedAlmond )
		.value( "b2_colorBlue", b2_colorBlue )
		.value( "b2_colorBlueViolet", b2_colorBlueViolet )
		.value( "b2_colorBrown", b2_colorBrown )
		.value( "b2_colorBurlywood", b2_colorBurlywood )
		.value( "b2_colorCadetBlue", b2_colorCadetBlue )
		.value( "b2_colorChartreuse", b2_colorChartreuse )
		.value( "b2_colorChocolate", b2_colorChocolate )
		.value( "b2_colorCoral", b2_colorCoral )
		.value( "b2_colorCornflowerBlue", b2_colorCornflowerBlue )
		.value( "b2_colorCornsilk", b2_colorCornsilk )
		.value( "b2_colorCrimson", b2_colorCrimson )
		.value( "b2_colorCyan", b2_colorCyan )
		.value( "b2_colorDarkBlue", b2_colorDarkBlue )
		.value( "b2_colorDarkCyan", b2_colorDarkCyan )
		.value( "b2_colorDarkGoldenRod", b2_colorDarkGoldenRod )
		.value( "b2_colorDarkGray", b2_colorDarkGray )
		.value( "b2_colorDarkGreen", b2_colorDarkGreen )
		.value( "b2_colorDarkKhaki", b2_colorDarkKhaki )
		.value( "b2_colorDarkMagenta", b2_colorDarkMagenta )
		.value( "b2_colorDarkOliveGreen", b2_colorDarkOliveGreen )
		.value( "b2_colorDarkOrange", b2_colorDarkOrange )
		.value( "b2_colorDarkOrchid", b2_colorDarkOrchid )
		.value( "b2_colorDarkRed", b2_colorDarkRed )
		.value( "b2_colorDarkSalmon", b2_colorDarkSalmon )
		.value( "b2_colorDarkSeaGreen", b2_colorDarkSeaGreen )
		.value( "b2_colorDarkSlateBlue", b2_colorDarkSlateBlue )
		.value( "b2_colorDarkSlateGray", b2_colorDarkSlateGray )
		.value( "b2_colorDarkTurquoise", b2_colorDarkTurquoise )
		.value( "b2_colorDarkViolet", b2_colorDarkViolet )
		.value( "b2_colorDeepPink", b2_colorDeepPink )
		.value( "b2_colorDeepSkyBlue", b2_colorDeepSkyBlue )
		.value( "b2_colorDimGray", b2_colorDimGray )
		.value( "b2_colorDodgerBlue", b2_colorDodgerBlue )
		.value( "b2_colorFireBrick", b2_colorFireBrick )
		.value( "b2_colorFloralWhite", b2_colorFloralWhite )
		.value( "b2_colorForestGreen", b2_colorForestGreen )
		.value( "b2_colorFuchsia", b2_colorFuchsia )
		.value( "b2_colorGainsboro", b2_colorGainsboro )
		.value( "b2_colorGhostWhite", b2_colorGhostWhite )
		.value( "b2_colorGold", b2_colorGold )
		.value( "b2_colorGoldenRod", b2_colorGoldenRod )
		.value( "b2_colorGray", b2_colorGray )
		.value( "b2_colorGreen", b2_colorGreen )
		.value( "b2_colorGreenYellow", b2_colorGreenYellow )
		.value( "b2_colorHoneyDew", b2_colorHoneyDew )
		.value( "b2_colorHotPink", b2_colorHotPink )
		.value( "b2_colorIndianRed", b2_colorIndianRed )
		.value( "b2_colorIndigo", b2_colorIndigo )
		.value( "b2_colorIvory", b2_colorIvory )
		.value( "b2_colorKhaki", b2_colorKhaki )
		.value( "b2_colorLavender", b2_colorLavender )
		.value( "b2_colorLavenderBlush", b2_colorLavenderBlush )
		.value( "b2_colorLawnGreen", b2_colorLawnGreen )
		.value( "b2_colorLemonChiffon", b2_colorLemonChiffon )
		.value( "b2_colorLightBlue", b2_colorLightBlue )
		.value( "b2_colorLightCoral", b2_colorLightCoral )
		.value( "b2_colorLightCyan", b2_colorLightCyan )
		.value( "b2_colorLightGoldenRodYellow", b2_colorLightGoldenRodYellow )
		.value( "b2_colorLightGray", b2_colorLightGray )
		.value( "b2_colorLightGreen", b2_colorLightGreen )
		.value( "b2_colorLightPink", b2_colorLightPink )
		.value( "b2_colorLightSalmon", b2_colorLightSalmon )
		.value( "b2_colorLightSeaGreen", b2_colorLightSeaGreen )
		.value( "b2_colorLightSkyBlue", b2_colorLightSkyBlue )
		.value( "b2_colorLightSlateGray", b2_colorLightSlateGray )
		.value( "b2_colorLightSteelBlue", b2_colorLightSteelBlue )
		.value( "b2_colorLightYellow", b2_colorLightYellow )
		.value( "b2_colorLime", b2_colorLime )
		.value( "b2_colorLimeGreen", b2_colorLimeGreen )
		.value( "b2_colorLinen", b2_colorLinen )
		.value( "b2_colorMagenta", b2_colorMagenta )
		.value( "b2_colorMaroon", b2_colorMaroon )
		.value( "b2_colorMediumAquaMarine", b2_colorMediumAquaMarine )
		.value( "b2_colorMediumBlue", b2_colorMediumBlue )
		.value( "b2_colorMediumOrchid", b2_colorMediumOrchid )
		.value( "b2_colorMediumPurple", b2_colorMediumPurple )
		.value( "b2_colorMediumSeaGreen", b2_colorMediumSeaGreen )
		.value( "b2_colorMediumSlateBlue", b2_colorMediumSlateBlue )
		.value( "b2_colorMediumSpringGreen", b2_colorMediumSpringGreen )
		.value( "b2_colorMediumTurquoise", b2_colorMediumTurquoise )
		.value( "b2_colorMediumVioletRed", b2_colorMediumVioletRed )
		.value( "b2_colorMidnightBlue", b2_colorMidnightBlue )
		.value( "b2_colorMintCream", b2_colorMintCream )
		.value( "b2_colorMistyRose", b2_colorMistyRose )
		.value( "b2_colorMoccasin", b2_colorMoccasin )
		.value( "b2_colorNavajoWhite", b2_colorNavajoWhite )
		.value( "b2_colorNavy", b2_colorNavy )
		.value( "b2_colorOldLace", b2_colorOldLace )
		.value( "b2_colorOlive", b2_colorOlive )
		.value( "b2_colorOliveDrab", b2_colorOliveDrab )
		.value( "b2_colorOrange", b2_colorOrange )
		.value( "b2_colorOrangeRed", b2_colorOrangeRed )
		.value( "b2_colorOrchid", b2_colorOrchid )
		.value( "b2_colorPaleGoldenRod", b2_colorPaleGoldenRod )
		.value( "b2_colorPaleGreen", b2_colorPaleGreen )
		.value( "b2_colorPaleTurquoise", b2_colorPaleTurquoise )
		.value( "b2_colorPaleVioletRed", b2_colorPaleVioletRed )
		.value( "b2_colorPapayaWhip", b2_colorPapayaWhip )
		.value( "b2_colorPeachPuff", b2_colorPeachPuff )
		.value( "b2_colorPeru", b2_colorPeru )
		.value( "b2_colorPink", b2_colorPink )
		.value( "b2_colorPlum", b2_colorPlum )
		.value( "b2_colorPowderBlue", b2_colorPowderBlue )
		.value( "b2_colorPurple", b2_colorPurple )
		.value( "b2_colorRebeccaPurple", b2_colorRebeccaPurple )
		.value( "b2_colorRed", b2_colorRed )
		.value( "b2_colorRosyBrown", b2_colorRosyBrown )
		.value( "b2_colorRoyalBlue", b2_colorRoyalBlue )
		.value( "b2_colorSaddleBrown", b2_colorSaddleBrown )
		.value( "b2_colorSalmon", b2_colorSalmon )
		.value( "b2_colorSandyBrown", b2_colorSandyBrown )
		.value( "b2_colorSeaGreen", b2_colorSeaGreen )
		.value( "b2_colorSeaShell", b2_colorSeaShell )
		.value( "b2_colorSienna", b2_colorSienna )
		.value( "b2_colorSilver", b2_colorSilver )
		.value( "b2_colorSkyBlue", b2_colorSkyBlue )
		.value( "b2_colorSlateBlue", b2_colorSlateBlue )
		.value( "b2_colorSlateGray", b2_colorSlateGray )
		.value( "b2_colorSnow", b2_colorSnow )
		.value( "b2_colorSpringGreen", b2_colorSpringGreen )
		.value( "b2_colorSteelBlue", b2_colorSteelBlue )
		.value( "b2_colorTan", b2_colorTan )
		.value( "b2_colorTeal", b2_colorTeal )
		.value( "b2_colorThistle", b2_colorThistle )
		.value( "b2_colorTomato", b2_colorTomato )
		.value( "b2_colorTurquoise", b2_colorTurquoise )
		.value( "b2_colorViolet", b2_colorViolet )
		.value( "b2_colorWheat", b2_colorWheat )
		.value( "b2_colorWhite", b2_colorWhite )
		.value( "b2_colorWhiteSmoke", b2_colorWhiteSmoke )
		.value( "b2_colorYellow", b2_colorYellow )
		.value( "b2_colorYellowGreen", b2_colorYellowGreen )
		.value( "b2_colorBox2DRed", b2_colorBox2DRed )
		.value( "b2_colorBox2DBlue", b2_colorBox2DBlue )
		.value( "b2_colorBox2DGreen", b2_colorBox2DGreen )
		.value( "b2_colorBox2DYellow", b2_colorBox2DYellow );

	// The Draw*Fcn callbacks are functions on the same object (extra fields below); the
	// context pointer is the object itself.
	value_object<b2DebugDraw>( "b2DebugDraw" )
		.field( "drawingBounds", &b2DebugDraw::drawingBounds )
		.field( "forceScale", &b2DebugDraw::forceScale )
		.field( "jointScale", &b2DebugDraw::jointScale )
		.field( "drawContacts", &b2DebugDraw::drawContacts )
		.field( "drawAnchorA", &b2DebugDraw::drawAnchorA )
		.field( "drawShapes", &b2DebugDraw::drawShapes )
		.field( "drawChainNormals", &b2DebugDraw::drawChainNormals )
		.field( "drawJoints", &b2DebugDraw::drawJoints )
		.field( "drawJointExtras", &b2DebugDraw::drawJointExtras )
		.field( "drawBounds", &b2DebugDraw::drawBounds )
		.field( "drawMass", &b2DebugDraw::drawMass )
		.field( "drawBodyNames", &b2DebugDraw::drawBodyNames )
		.field( "drawGraphColors", &b2DebugDraw::drawGraphColors )
		.field( "drawContactFeatures", &b2DebugDraw::drawContactFeatures )
		.field( "drawContactNormals", &b2DebugDraw::drawContactNormals )
		.field( "drawContactForces", &b2DebugDraw::drawContactForces )
		.field( "drawFrictionForces", &b2DebugDraw::drawFrictionForces )
		.field( "drawIslands", &b2DebugDraw::drawIslands );
	extra_field( "b2DebugDraw", "DrawPolygonFcn", "(transform: b2Transform, vertices: Float32Array, vertexCount: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawSolidPolygonFcn", "(transform: b2Transform, vertices: Float32Array, vertexCount: number, radius: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawCircleFcn", "(center: b2Vec2, radius: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawSolidCircleFcn", "(transform: b2Transform, center: b2Vec2, radius: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawSolidCapsuleFcn", "(p1: b2Vec2, p2: b2Vec2, radius: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawLineFcn", "(p1: b2Vec2, p2: b2Vec2, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawTransformFcn", "(transform: b2Transform) => void" );
	extra_field( "b2DebugDraw", "DrawPointFcn", "(p: b2Vec2, size: number, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawStringFcn", "(p: b2Vec2, s: string, color: number) => void" );
	extra_field( "b2DebugDraw", "DrawBoundsFcn", "(aabb: b2AABB, color: number) => void" );

	// replay metadata (box2d.h)
	value_object<b2ReplayInfo>( "b2ReplayInfo" )
		.field( "frameCount", &b2ReplayInfo::frameCount )
		.field( "workerCount", &b2ReplayInfo::workerCount )
		.field( "timeStep", &b2ReplayInfo::timeStep )
		.field( "subStepCount", &b2ReplayInfo::subStepCount )
		.field( "lengthScale", &b2ReplayInfo::lengthScale )
		.field( "bounds", &b2ReplayInfo::bounds );

	enum_<b2ReplayQueryType>( "b2ReplayQueryType" )
		.value( "b2_replayQueryOverlapAABB", b2_replayQueryOverlapAABB )
		.value( "b2_replayQueryOverlapShape", b2_replayQueryOverlapShape )
		.value( "b2_replayQueryCastRay", b2_replayQueryCastRay )
		.value( "b2_replayQueryCastShape", b2_replayQueryCastShape )
		.value( "b2_replayQueryCollideMover", b2_replayQueryCollideMover )
		.value( "b2_replayQueryCastRayClosest", b2_replayQueryCastRayClosest )
		.value( "b2_replayQueryCastMover", b2_replayQueryCastMover )
		.value( "b2_replayQueryShapeTestPoint", b2_replayQueryShapeTestPoint )
		.value( "b2_replayQueryShapeRayCast", b2_replayQueryShapeRayCast );

	value_object<b2ReplayQueryInfo>( "b2ReplayQueryInfo" )
		.field( "type", &b2ReplayQueryInfo::type )
		.field( "filter", &b2ReplayQueryInfo::filter )
		.field( "aabb", &b2ReplayQueryInfo::aabb )
		.field( "origin", &b2ReplayQueryInfo::origin )
		.field( "translation", &b2ReplayQueryInfo::translation )
		.field( "shape", &b2ReplayQueryInfo::shape )
		.field( "hitCount", &b2ReplayQueryInfo::hitCount );

	value_object<b2ReplayQueryHit>( "b2ReplayQueryHit" )
		.field( "shape", &b2ReplayQueryHit::shape )
		.field( "point", &b2ReplayQueryHit::point )
		.field( "normal", &b2ReplayQueryHit::normal )
		.field( "fraction", &b2ReplayQueryHit::fraction );

	// ======================================================================
	// Constants: Box2D's public #defines and static const values
	// ======================================================================

	// base.h
	constant_value( "B2_NULL_INDEX", "number", +[]() { return val( B2_NULL_INDEX ); } );
	constant_value( "B2_VERSION_MAJOR", "number", +[]() { return val( B2_VERSION_MAJOR ); } );
	constant_value( "B2_VERSION_MINOR", "number", +[]() { return val( B2_VERSION_MINOR ); } );
	constant_value( "B2_VERSION_REVISION", "number", +[]() { return val( B2_VERSION_REVISION ); } );
	constant_value( "B2_HASH_INIT", "number", +[]() { return val( (uint32_t)B2_HASH_INIT ); } );
	// constants.h
	constant_value( "B2_HUGE", "number", +[]() { return val( B2_HUGE ); }, true );
	constant_value( "B2_MAX_WORKERS", "number", +[]() { return val( B2_MAX_WORKERS ); } );
	constant_value( "B2_MAX_TASKS", "number", +[]() { return val( B2_MAX_TASKS ); } );
	constant_value( "B2_GRAPH_COLOR_COUNT", "number", +[]() { return val( B2_GRAPH_COLOR_COUNT ); } );
	constant_value( "B2_LINEAR_SLOP", "number", +[]() { return val( B2_LINEAR_SLOP ); }, true );
	constant_value( "B2_MAX_WORLDS", "number", +[]() { return val( B2_MAX_WORLDS ); } );
	constant_value( "B2_NAME_LENGTH", "number", +[]() { return val( B2_NAME_LENGTH ); } );
	constant_value( "B2_MAX_ROTATION", "number", +[]() { return val( B2_MAX_ROTATION ); } );
	constant_value( "B2_SPECULATIVE_DISTANCE", "number", +[]() { return val( B2_SPECULATIVE_DISTANCE ); }, true );
	constant_value( "B2_CONTACT_RECYCLE_DISTANCE", "number", +[]() { return val( B2_CONTACT_RECYCLE_DISTANCE ); }, true );
	constant_value( "B2_CONTACT_RECYCLE_COS_ANGLE", "number", +[]() { return val( B2_CONTACT_RECYCLE_COS_ANGLE ); } );
	constant_value( "B2_MAX_AABB_MARGIN", "number", +[]() { return val( B2_MAX_AABB_MARGIN ); }, true );
	constant_value( "B2_AABB_MARGIN_FRACTION", "number", +[]() { return val( B2_AABB_MARGIN_FRACTION ); } );
	constant_value( "B2_TIME_TO_SLEEP", "number", +[]() { return val( B2_TIME_TO_SLEEP ); } );
	constant_value( "B2_MAX_RESTITUTION_ITERATIONS", "number", +[]() { return val( B2_MAX_RESTITUTION_ITERATIONS ); } );
	// types.h
	constant_value( "B2_DEFAULT_CATEGORY_BITS", "bigint", +[]() { return val( (uint64_t)B2_DEFAULT_CATEGORY_BITS ); } );
	constant_value( "B2_DEFAULT_MASK_BITS", "bigint", +[]() { return val( (uint64_t)B2_DEFAULT_MASK_BITS ); } );
	// collision.h
	constant_value( "B2_MAX_POLYGON_VERTICES", "number", +[]() { return val( B2_MAX_POLYGON_VERTICES ); } );
	constant_value( "b2_emptySimplexCache", "b2SimplexCache", +[]() { return val( b2_emptySimplexCache ); } );
	// math_types.h
	constant_value( "B2_PI", "number", +[]() { return val( B2_PI ); } );
	constant_value( "b2Vec2_zero", "b2Vec2", +[]() { return val( b2Vec2_zero ); } );
	constant_value( "b2Rot_identity", "b2Rot", +[]() { return val( b2Rot_identity ); } );
	constant_value( "b2Transform_identity", "b2Transform", +[]() { return val( b2Transform_identity ); } );
	constant_value( "b2Mat22_zero", "b2Mat22", +[]() { return val( b2Mat22_zero ); } );
	constant_value( "b2Pos_zero", "b2Vec2", +[]() { return val( b2Pos_zero ); } );
	constant_value( "b2WorldTransform_identity", "b2Transform", +[]() { return val( b2WorldTransform_identity ); } );
	// id.h
	constant_value( "b2_nullWorldId", "b2WorldId", +[]() { return val( b2_nullWorldId ); } );
	constant_value( "b2_nullBodyId", "b2BodyId", +[]() { return val( b2_nullBodyId ); } );
	constant_value( "b2_nullShapeId", "b2ShapeId", +[]() { return val( b2_nullShapeId ); } );
	constant_value( "b2_nullChainId", "b2ChainId", +[]() { return val( b2_nullChainId ); } );
	constant_value( "b2_nullJointId", "b2JointId", +[]() { return val( b2_nullJointId ); } );
	constant_value( "b2_nullContactId", "b2ContactId", +[]() { return val( b2_nullContactId ); } );

	// ======================================================================
	// Functions a 1:1 binding carries (generated from the headers, in header order).
	// Object-state math getters are out_function readers (file header).
	// ======================================================================

	// ---- base.h ----
	function( "b2GetByteCount()", &b2GetByteCount );
	function( "b2GetVersion()", &b2GetVersion );
	function( "b2IsDoublePrecision()", &b2IsDoublePrecision );
	function( "b2GetTicks()", &b2GetTicks );
	function( "b2GetMilliseconds(ticks)", &b2GetMilliseconds );
	function( "b2Yield()", &b2Yield );

	// ---- math_functions.h ----
	function( "b2IsValidFloat(a)", &b2IsValidFloat );
	function( "b2IsValidVec2(v)", &b2IsValidVec2 );
	function( "b2IsValidRotation(q)", &b2IsValidRotation );
	function( "b2IsValidTransform(t)", &b2IsValidTransform );
	function( "b2IsValidAABB(aabb)", &b2IsValidAABB );
	function( "b2IsValidPlane(a)", &b2IsValidPlane );
	function( "b2IsValidPosition(p)", &b2IsValidPosition );
	function( "b2IsValidWorldTransform(t)", &b2IsValidWorldTransform );
	function( "b2MinInt(a, b)", &b2MinInt );
	function( "b2MaxInt(a, b)", &b2MaxInt );
	function( "b2AbsInt(a)", &b2AbsInt );
	function( "b2ClampInt(a, lower, upper)", &b2ClampInt );
	function( "b2CeilingInt(numerator, denominator)", &b2CeilingInt );
	function( "b2MinFloat(a, b)", &b2MinFloat );
	function( "b2MaxFloat(a, b)", &b2MaxFloat );
	function( "b2AbsFloat(a)", &b2AbsFloat );
	function( "b2ClampFloat(a, lower, upper)", &b2ClampFloat );
	function( "b2Atan2(y, x)", &b2Atan2 );
	function( "b2ComputeCosSin(radians)", &b2ComputeCosSin );
	function( "b2Dot(a, b)", &b2Dot );
	function( "b2Cross(a, b)", &b2Cross );
	function( "b2CrossVS(v, s)", &b2CrossVS );
	function( "b2CrossSV(s, v)", &b2CrossSV );
	function( "b2LeftPerp(v)", &b2LeftPerp );
	function( "b2RightPerp(v)", &b2RightPerp );
	function( "b2Add(a, b)", &b2Add );
	function( "b2Sub(a, b)", &b2Sub );
	function( "b2Neg(a)", &b2Neg );
	function( "b2Lerp(a, b, t)", &b2Lerp );
	function( "b2Mul(a, b)", &b2Mul );
	function( "b2MulSV(s, v)", &b2MulSV );
	function( "b2MulAdd(a, s, b)", &b2MulAdd );
	function( "b2MulSub(a, s, b)", &b2MulSub );
	function( "b2Abs(a)", &b2Abs );
	function( "b2Min(a, b)", &b2Min );
	function( "b2Max(a, b)", &b2Max );
	function( "b2Clamp(v, a, b)", &b2Clamp );
	function( "b2Length(v)", &b2Length );
	function( "b2Distance(a, b)", &b2Distance );
	function( "b2Normalize(a)", &b2Normalize );
	function( "b2IsNormalized(a)", &b2IsNormalized );
	function( "b2NormalizeRot(q)", &b2NormalizeRot );
	function( "b2IntegrateRotation(q1, deltaAngle)", &b2IntegrateRotation );
	function( "b2LengthSquared(v)", &b2LengthSquared );
	function( "b2DistanceSquared(a, b)", &b2DistanceSquared );
	function( "b2MakeRot(radians)", &b2MakeRot );
	function( "b2MakeRotFromUnitVector(unitVector)", &b2MakeRotFromUnitVector );
	function( "b2ComputeRotationBetweenUnitVectors(v1, v2)", &b2ComputeRotationBetweenUnitVectors );
	function( "b2IsNormalizedRot(q)", &b2IsNormalizedRot );
	function( "b2InvertRot(a)", &b2InvertRot );
	function( "b2NLerp(q1, q2, t)", &b2NLerp );
	function( "b2ComputeAngularVelocity(q1, q2, inv_h)", &b2ComputeAngularVelocity );
	function( "b2Rot_GetAngle(q)", &b2Rot_GetAngle );
	function( "b2Rot_GetXAxis(q)", &b2Rot_GetXAxis );
	function( "b2Rot_GetYAxis(q)", &b2Rot_GetYAxis );
	function( "b2MulRot(q, r)", &b2MulRot );
	function( "b2InvMulRot(a, b)", &b2InvMulRot );
	function( "b2RelativeAngle(a, b)", &b2RelativeAngle );
	function( "b2UnwindAngle(radians)", &b2UnwindAngle );
	function( "b2RotateVector(q, v)", &b2RotateVector );
	function( "b2InvRotateVector(q, v)", &b2InvRotateVector );
	function( "b2TransformPoint(t, p)", &b2TransformPoint );
	function( "b2InvTransformPoint(t, p)", &b2InvTransformPoint );
	function( "b2MulTransforms(A, B)", &b2MulTransforms );
	function( "b2InvMulTransforms(A, B)", &b2InvMulTransforms );
	function( "b2ToPos(v)", &b2ToPos );
	function( "b2ToVec2(p)", &b2ToVec2 );
	function( "b2RoundDownFloat(x)", &b2RoundDownFloat );
	function( "b2RoundUpFloat(x)", &b2RoundUpFloat );
	function( "b2SubPos(a, b)", &b2SubPos );
	function( "b2OffsetPos(p, d)", &b2OffsetPos );
	function( "b2LerpPosition(a, b, t)", &b2LerpPosition );
	function( "b2TransformWorldPoint(t, p)", &b2TransformWorldPoint );
	function( "b2InvTransformWorldPoint(t, p)", &b2InvTransformWorldPoint );
	function( "b2InvMulWorldTransforms(A, B)", &b2InvMulWorldTransforms );
	function( "b2MulWorldTransforms(A, B)", &b2MulWorldTransforms );
	function( "b2ToRelativeTransform(t, base)", &b2ToRelativeTransform );
	function( "b2MakeWorldTransform(t)", &b2MakeWorldTransform );
	function( "b2MulMV(A, v)", &b2MulMV );
	function( "b2GetInverse22(A)", &b2GetInverse22 );
	function( "b2Solve22(A, b)", &b2Solve22 );
	function( "b2AABB_Contains(a, b)", &b2AABB_Contains );
	function( "b2AABB_Center(a)", &b2AABB_Center );
	function( "b2AABB_Extents(a)", &b2AABB_Extents );
	function( "b2AABB_Union(a, b)", &b2AABB_Union );
	function( "b2AABB_Overlaps(a, b)", &b2AABB_Overlaps );
	function( "b2PlaneSeparation(plane, point)", &b2PlaneSeparation );
	function( "b2SpringDamper(hertz, dampingRatio, position, velocity, timeStep)", &b2SpringDamper );
	function( "b2SetLengthUnitsPerMeter(lengthUnits)", &b2SetLengthUnitsPerMeter );
	function( "b2GetLengthUnitsPerMeter()", &b2GetLengthUnitsPerMeter );

	// ---- id.h ----
	function( "b2StoreWorldId(id)", &b2StoreWorldId );
	function( "b2LoadWorldId(x)", &b2LoadWorldId );
	function( "b2StoreBodyId(id)", &b2StoreBodyId );
	function( "b2LoadBodyId(x)", &b2LoadBodyId );
	function( "b2StoreShapeId(id)", &b2StoreShapeId );
	function( "b2LoadShapeId(x)", &b2LoadShapeId );
	function( "b2StoreChainId(id)", &b2StoreChainId );
	function( "b2LoadChainId(x)", &b2LoadChainId );
	function( "b2StoreJointId(id)", &b2StoreJointId );
	function( "b2LoadJointId(x)", &b2LoadJointId );

	// ---- collision.h ----
	function( "b2IsValidRay(input)", +[]( b2RayCastInput input ) { return b2IsValidRay( &input ); } );
	function( "b2MakePolygon(hull, radius)", +[]( b2Hull hull, float radius ) { return b2MakePolygon( &hull, radius ); } );
	function( "b2MakeOffsetPolygon(hull, position, rotation)", +[]( b2Hull hull, b2Vec2 position, b2Rot rotation ) { return b2MakeOffsetPolygon( &hull, position, rotation ); } );
	function( "b2MakeOffsetRoundedPolygon(hull, position, rotation, radius)", +[]( b2Hull hull, b2Vec2 position, b2Rot rotation, float radius ) { return b2MakeOffsetRoundedPolygon( &hull, position, rotation, radius ); } );
	function( "b2MakeSquare(halfWidth)", &b2MakeSquare );
	function( "b2MakeBox(halfWidth, halfHeight)", &b2MakeBox );
	function( "b2MakeRoundedBox(halfWidth, halfHeight, radius)", &b2MakeRoundedBox );
	function( "b2MakeOffsetBox(halfWidth, halfHeight, center, rotation)", &b2MakeOffsetBox );
	function( "b2MakeOffsetRoundedBox(halfWidth, halfHeight, center, rotation, radius)", &b2MakeOffsetRoundedBox );
	function( "b2TransformPolygon(transform, polygon)", +[]( b2Transform transform, b2Polygon polygon ) { return b2TransformPolygon( transform, &polygon ); } );
	function( "b2ComputeCircleMass(shape, density)", +[]( b2Circle shape, float density ) { return b2ComputeCircleMass( &shape, density ); } );
	function( "b2ComputeCapsuleMass(shape, density)", +[]( b2Capsule shape, float density ) { return b2ComputeCapsuleMass( &shape, density ); } );
	function( "b2ComputePolygonMass(shape, density)", +[]( b2Polygon shape, float density ) { return b2ComputePolygonMass( &shape, density ); } );
	function( "b2ComputeCircleAABB(shape, transform)", +[]( b2Circle shape, b2WorldTransform transform ) { return b2ComputeCircleAABB( &shape, transform ); } );
	function( "b2ComputeCapsuleAABB(shape, transform)", +[]( b2Capsule shape, b2WorldTransform transform ) { return b2ComputeCapsuleAABB( &shape, transform ); } );
	function( "b2ComputePolygonAABB(shape, transform)", +[]( b2Polygon shape, b2WorldTransform transform ) { return b2ComputePolygonAABB( &shape, transform ); } );
	function( "b2ComputeSegmentAABB(shape, transform)", +[]( b2Segment shape, b2WorldTransform transform ) { return b2ComputeSegmentAABB( &shape, transform ); } );
	function( "b2PointInCircle(shape, point)", +[]( b2Circle shape, b2Vec2 point ) { return b2PointInCircle( &shape, point ); } );
	function( "b2PointInCapsule(shape, point)", +[]( b2Capsule shape, b2Vec2 point ) { return b2PointInCapsule( &shape, point ); } );
	function( "b2PointInPolygon(shape, point)", +[]( b2Polygon shape, b2Vec2 point ) { return b2PointInPolygon( &shape, point ); } );
	function( "b2RayCastCircle(shape, input)", +[]( b2Circle shape, b2RayCastInput input ) { return b2RayCastCircle( &shape, &input ); } );
	function( "b2RayCastCapsule(shape, input)", +[]( b2Capsule shape, b2RayCastInput input ) { return b2RayCastCapsule( &shape, &input ); } );
	function( "b2RayCastSegment(shape, input, oneSided)", +[]( b2Segment shape, b2RayCastInput input, bool oneSided ) { return b2RayCastSegment( &shape, &input, oneSided ); } );
	function( "b2RayCastPolygon(shape, input)", +[]( b2Polygon shape, b2RayCastInput input ) { return b2RayCastPolygon( &shape, &input ); } );
	function( "b2ShapeCastCircle(shape, input)", +[]( b2Circle shape, b2ShapeCastInput input ) { return b2ShapeCastCircle( &shape, &input ); } );
	function( "b2ShapeCastCapsule(shape, input)", +[]( b2Capsule shape, b2ShapeCastInput input ) { return b2ShapeCastCapsule( &shape, &input ); } );
	function( "b2ShapeCastSegment(shape, input)", +[]( b2Segment shape, b2ShapeCastInput input ) { return b2ShapeCastSegment( &shape, &input ); } );
	function( "b2ShapeCastPolygon(shape, input)", +[]( b2Polygon shape, b2ShapeCastInput input ) { return b2ShapeCastPolygon( &shape, &input ); } );
	function( "b2ValidateHull(hull)", +[]( b2Hull hull ) { return b2ValidateHull( &hull ); } );
	function( "b2SegmentDistance(p1, q1, p2, q2)", &b2SegmentDistance );
	function( "b2ShapeCast(input)", +[]( b2ShapeCastPairInput input ) { return b2ShapeCast( &input ); } );
	function( "b2GetSweepTransform(sweep, time)", +[]( b2Sweep sweep, float time ) { return b2GetSweepTransform( &sweep, time ); } );
	function( "b2TimeOfImpact(input)", +[]( b2TOIInput input ) { return b2TimeOfImpact( &input ); } );
	function( "b2CollideCircles(circleA, circleB, xf)", +[]( b2Circle circleA, b2Circle circleB, b2Transform xf ) { return b2CollideCircles( &circleA, &circleB, xf ); } );
	function( "b2CollideCapsuleAndCircle(capsuleA, circleB, xf)", +[]( b2Capsule capsuleA, b2Circle circleB, b2Transform xf ) { return b2CollideCapsuleAndCircle( &capsuleA, &circleB, xf ); } );
	function( "b2CollideSegmentAndCircle(segmentA, circleB, xf)", +[]( b2Segment segmentA, b2Circle circleB, b2Transform xf ) { return b2CollideSegmentAndCircle( &segmentA, &circleB, xf ); } );
	function( "b2CollidePolygonAndCircle(polygonA, circleB, xf)", +[]( b2Polygon polygonA, b2Circle circleB, b2Transform xf ) { return b2CollidePolygonAndCircle( &polygonA, &circleB, xf ); } );
	function( "b2CollideCapsules(capsuleA, capsuleB, xf)", +[]( b2Capsule capsuleA, b2Capsule capsuleB, b2Transform xf ) { return b2CollideCapsules( &capsuleA, &capsuleB, xf ); } );
	function( "b2CollideSegmentAndCapsule(segmentA, capsuleB, xf)", +[]( b2Segment segmentA, b2Capsule capsuleB, b2Transform xf ) { return b2CollideSegmentAndCapsule( &segmentA, &capsuleB, xf ); } );
	function( "b2CollidePolygonAndCapsule(polygonA, capsuleB, xf)", +[]( b2Polygon polygonA, b2Capsule capsuleB, b2Transform xf ) { return b2CollidePolygonAndCapsule( &polygonA, &capsuleB, xf ); } );
	function( "b2CollidePolygons(polygonA, polygonB, xf)", +[]( b2Polygon polygonA, b2Polygon polygonB, b2Transform xf ) { return b2CollidePolygons( &polygonA, &polygonB, xf ); } );
	function( "b2CollideSegmentAndPolygon(segmentA, polygonB, xf)", +[]( b2Segment segmentA, b2Polygon polygonB, b2Transform xf ) { return b2CollideSegmentAndPolygon( &segmentA, &polygonB, xf ); } );
	function( "b2CollideChainSegmentAndCircle(segmentA, circleB, xf)", +[]( b2ChainSegment segmentA, b2Circle circleB, b2Transform xf ) { return b2CollideChainSegmentAndCircle( &segmentA, &circleB, xf ); } );

	// ---- types.h ----
	function( "b2DefaultWorldDef()", &b2DefaultWorldDef );
	function( "b2DefaultBodyDef()", &b2DefaultBodyDef );
	function( "b2DefaultFilter()", &b2DefaultFilter );
	function( "b2DefaultQueryFilter()", &b2DefaultQueryFilter );
	function( "b2DefaultSurfaceMaterial()", &b2DefaultSurfaceMaterial );
	function( "b2DefaultShapeDef()", &b2DefaultShapeDef );
	function( "b2DefaultChainDef()", &b2DefaultChainDef );
	function( "b2DefaultDistanceJointDef()", &b2DefaultDistanceJointDef );
	function( "b2DefaultFilterJointDef()", &b2DefaultFilterJointDef );
	function( "b2DefaultMotorJointDef()", &b2DefaultMotorJointDef );
	function( "b2DefaultMoverJointDef()", &b2DefaultMoverJointDef );
	function( "b2DefaultPogoJointDef()", &b2DefaultPogoJointDef );
	function( "b2DefaultPrismaticJointDef()", &b2DefaultPrismaticJointDef );
	function( "b2DefaultRevoluteJointDef()", &b2DefaultRevoluteJointDef );
	function( "b2DefaultWeldJointDef()", &b2DefaultWeldJointDef );
	function( "b2DefaultWheelJointDef()", &b2DefaultWheelJointDef );
	function( "b2DefaultExplosionDef()", &b2DefaultExplosionDef );
	function( "b2GetGraphColor(index)", &b2GetGraphColor );
	function( "b2DefaultDebugDraw()", &b2DefaultDebugDraw );

	// ---- box2d.h ----
	function( "b2World_IsValid(id)", &b2World_IsValid );
	function( "b2World_Step(worldId, timeStep, subStepCount)", &b2World_Step );
	out_function( "b2World_GetBounds(out, worldId)", out_desc::AABB, out_desc::Pass,
		+[]( uintptr_t out, b2WorldId worldId ) { writeAABB( out, b2World_GetBounds( worldId ) ); } );
	function( "b2World_CastRayClosest(worldId, origin, translation, filter)", &b2World_CastRayClosest );
	function( "b2World_CastMover(worldId, origin, mover, translation, filter)", +[]( b2WorldId worldId, b2Pos origin, b2Capsule mover, b2Vec2 translation, b2QueryFilter filter ) { return b2World_CastMover( worldId, origin, &mover, translation, filter ); } );
	function( "b2World_EnableSleeping(worldId, flag)", &b2World_EnableSleeping );
	function( "b2World_IsSleepingEnabled(worldId)", &b2World_IsSleepingEnabled );
	function( "b2World_EnableContinuous(worldId, flag)", &b2World_EnableContinuous );
	function( "b2World_IsContinuousEnabled(worldId)", &b2World_IsContinuousEnabled );
	function( "b2World_SetRestitutionThreshold(worldId, value)", &b2World_SetRestitutionThreshold );
	function( "b2World_GetRestitutionThreshold(worldId)", &b2World_GetRestitutionThreshold );
	function( "b2World_SetRestitutionIterations(worldId, iterations)", &b2World_SetRestitutionIterations );
	function( "b2World_GetRestitutionIterations(worldId)", &b2World_GetRestitutionIterations );
	function( "b2World_EnableRestitutionPropagation(worldId, flag)", &b2World_EnableRestitutionPropagation );
	function( "b2World_IsRestitutionPropagationEnabled(worldId)", &b2World_IsRestitutionPropagationEnabled );
	function( "b2World_SetHitEventThreshold(worldId, value)", &b2World_SetHitEventThreshold );
	function( "b2World_GetHitEventThreshold(worldId)", &b2World_GetHitEventThreshold );
	function( "b2World_SetGravity(worldId, gravity)", &b2World_SetGravity );
	out_function( "b2World_GetGravity(out, worldId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2WorldId worldId ) { writeVec2( out, b2World_GetGravity( worldId ) ); } );
	function( "b2World_Explode(worldId, explosionDef)", +[]( b2WorldId worldId, b2ExplosionDef explosionDef ) { return b2World_Explode( worldId, &explosionDef ); } );
	function( "b2World_SetContactTuning(worldId, hertz, dampingRatio, pushSpeed)", &b2World_SetContactTuning );
	function( "b2World_SetContactRecycleDistance(worldId, recycleDistance)", &b2World_SetContactRecycleDistance );
	function( "b2World_GetContactRecycleDistance(worldId)", &b2World_GetContactRecycleDistance );
	function( "b2World_SetMaximumLinearSpeed(worldId, maximumLinearSpeed)", &b2World_SetMaximumLinearSpeed );
	function( "b2World_GetMaximumLinearSpeed(worldId)", &b2World_GetMaximumLinearSpeed );
	function( "b2World_EnableWarmStarting(worldId, flag)", &b2World_EnableWarmStarting );
	function( "b2World_IsWarmStartingEnabled(worldId)", &b2World_IsWarmStartingEnabled );
	function( "b2World_GetAwakeBodyCount(worldId)", &b2World_GetAwakeBodyCount );
	function( "b2World_GetProfile(worldId)", &b2World_GetProfile );
	function( "b2World_GetCounters(worldId)", &b2World_GetCounters );
	function( "b2World_GetMaxCapacity(worldId)", &b2World_GetMaxCapacity );
	function( "b2World_SetWorkerCount(worldId, count)", &b2World_SetWorkerCount );
	function( "b2World_GetWorkerCount(worldId)", &b2World_GetWorkerCount );
	function( "b2World_DumpMemoryStats(worldId)", &b2World_DumpMemoryStats );
	function( "b2World_RebuildStaticTree(worldId)", &b2World_RebuildStaticTree );
	function( "b2World_GetStateHash(worldId)", &b2World_GetStateHash );
	function( "b2World_StopRecording(worldId)", &b2World_StopRecording );
	function( "b2DestroyBody(bodyId)", &b2DestroyBody );
	function( "b2Body_IsValid(id)", &b2Body_IsValid );
	function( "b2Body_GetType(bodyId)", &b2Body_GetType );
	function( "b2Body_SetType(bodyId, type)", &b2Body_SetType );
	out_function( "b2Body_GetPosition(out, bodyId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeVec2( out, b2Body_GetPosition( bodyId ) ); } );
	out_function( "b2Body_GetRotation(out, bodyId)", out_desc::Rot, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeRot( out, b2Body_GetRotation( bodyId ) ); } );
	out_function( "b2Body_GetTransform(outPosition, outRotation, bodyId)", out_desc::Vec2, out_desc::Rot, out_desc::Pass,
		+[]( uintptr_t outPosition, uintptr_t outRotation, b2BodyId bodyId ) { b2WorldTransform t = b2Body_GetTransform( bodyId ); writeVec2( outPosition, t.p ); writeRot( outRotation, t.q ); } );
	function( "b2Body_SetTransform(bodyId, position, rotation)", &b2Body_SetTransform );
	out_function( "b2Body_GetLocalPoint(out, bodyId, worldPoint)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Pos worldPoint ) { writeVec2( out, b2Body_GetLocalPoint( bodyId, worldPoint ) ); } );
	out_function( "b2Body_GetWorldPoint(out, bodyId, localPoint)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Vec2 localPoint ) { writeVec2( out, b2Body_GetWorldPoint( bodyId, localPoint ) ); } );
	out_function( "b2Body_GetLocalVector(out, bodyId, worldVector)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Vec2 worldVector ) { writeVec2( out, b2Body_GetLocalVector( bodyId, worldVector ) ); } );
	out_function( "b2Body_GetWorldVector(out, bodyId, localVector)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Vec2 localVector ) { writeVec2( out, b2Body_GetWorldVector( bodyId, localVector ) ); } );
	out_function( "b2Body_GetLinearVelocity(out, bodyId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeVec2( out, b2Body_GetLinearVelocity( bodyId ) ); } );
	function( "b2Body_GetAngularVelocity(bodyId)", &b2Body_GetAngularVelocity );
	function( "b2Body_SetLinearVelocity(bodyId, linearVelocity)", &b2Body_SetLinearVelocity );
	function( "b2Body_SetAngularVelocity(bodyId, angularVelocity)", &b2Body_SetAngularVelocity );
	function( "b2Body_SetTargetTransform(bodyId, target, timeStep, wake)", &b2Body_SetTargetTransform );
	out_function( "b2Body_GetLocalPointVelocity(out, bodyId, localPoint)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Vec2 localPoint ) { writeVec2( out, b2Body_GetLocalPointVelocity( bodyId, localPoint ) ); } );
	out_function( "b2Body_GetWorldPointVelocity(out, bodyId, worldPoint)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId, b2Pos worldPoint ) { writeVec2( out, b2Body_GetWorldPointVelocity( bodyId, worldPoint ) ); } );
	function( "b2Body_ApplyForce(bodyId, force, point, wake)", &b2Body_ApplyForce );
	function( "b2Body_ApplyForceToCenter(bodyId, force, wake)", &b2Body_ApplyForceToCenter );
	function( "b2Body_ApplyTorque(bodyId, torque, wake)", &b2Body_ApplyTorque );
	function( "b2Body_ClearForces(bodyId)", &b2Body_ClearForces );
	function( "b2Body_ApplyLinearImpulse(bodyId, impulse, point, wake)", &b2Body_ApplyLinearImpulse );
	function( "b2Body_ApplyLinearImpulseToCenter(bodyId, impulse, wake)", &b2Body_ApplyLinearImpulseToCenter );
	function( "b2Body_ApplyAngularImpulse(bodyId, impulse, wake)", &b2Body_ApplyAngularImpulse );
	function( "b2Body_GetMass(bodyId)", &b2Body_GetMass );
	function( "b2Body_GetRotationalInertia(bodyId)", &b2Body_GetRotationalInertia );
	out_function( "b2Body_GetLocalCenter(out, bodyId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeVec2( out, b2Body_GetLocalCenter( bodyId ) ); } );
	out_function( "b2Body_GetWorldCenter(out, bodyId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeVec2( out, b2Body_GetWorldCenter( bodyId ) ); } );
	function( "b2Body_SetMassData(bodyId, massData)", &b2Body_SetMassData );
	function( "b2Body_GetMassData(bodyId)", &b2Body_GetMassData );
	function( "b2Body_UpdateMassFromShapes(bodyId)", &b2Body_UpdateMassFromShapes );
	function( "b2Body_SetLinearDamping(bodyId, linearDamping)", &b2Body_SetLinearDamping );
	function( "b2Body_GetLinearDamping(bodyId)", &b2Body_GetLinearDamping );
	function( "b2Body_SetAngularDamping(bodyId, angularDamping)", &b2Body_SetAngularDamping );
	function( "b2Body_GetAngularDamping(bodyId)", &b2Body_GetAngularDamping );
	function( "b2Body_SetGravityScale(bodyId, gravityScale)", &b2Body_SetGravityScale );
	function( "b2Body_GetGravityScale(bodyId)", &b2Body_GetGravityScale );
	function( "b2Body_IsAwake(bodyId)", &b2Body_IsAwake );
	function( "b2Body_SetAwake(bodyId, awake)", &b2Body_SetAwake );
	function( "b2Body_WakeTouching(bodyId)", &b2Body_WakeTouching );
	function( "b2Body_EnableSleep(bodyId, enableSleep)", &b2Body_EnableSleep );
	function( "b2Body_IsSleepEnabled(bodyId)", &b2Body_IsSleepEnabled );
	function( "b2Body_SetSleepThreshold(bodyId, sleepThreshold)", &b2Body_SetSleepThreshold );
	function( "b2Body_GetSleepThreshold(bodyId)", &b2Body_GetSleepThreshold );
	function( "b2Body_SetSafetyFactor(bodyId, safetyFactor)", &b2Body_SetSafetyFactor );
	function( "b2Body_GetSafetyFactor(bodyId)", &b2Body_GetSafetyFactor );
	function( "b2Body_IsEnabled(bodyId)", &b2Body_IsEnabled );
	function( "b2Body_Disable(bodyId)", &b2Body_Disable );
	function( "b2Body_Enable(bodyId)", &b2Body_Enable );
	function( "b2Body_SetMotionLocks(bodyId, locks)", &b2Body_SetMotionLocks );
	function( "b2Body_GetMotionLocks(bodyId)", &b2Body_GetMotionLocks );
	function( "b2Body_SetBullet(bodyId, flag)", &b2Body_SetBullet );
	function( "b2Body_IsBullet(bodyId)", &b2Body_IsBullet );
	function( "b2Body_EnableContactRecycling(bodyId, flag)", &b2Body_EnableContactRecycling );
	function( "b2Body_IsContactRecyclingEnabled(bodyId)", &b2Body_IsContactRecyclingEnabled );
	function( "b2Body_EnableContactEvents(bodyId, flag)", &b2Body_EnableContactEvents );
	function( "b2Body_EnableHitEvents(bodyId, flag)", &b2Body_EnableHitEvents );
	function( "b2Body_GetWorld(bodyId)", &b2Body_GetWorld );
	function( "b2Body_GetShapeCount(bodyId)", &b2Body_GetShapeCount );
	function( "b2Body_GetJointCount(bodyId)", &b2Body_GetJointCount );
	function( "b2Body_GetContactCapacity(bodyId)", &b2Body_GetContactCapacity );
	out_function( "b2Body_ComputeAABB(out, bodyId)", out_desc::AABB, out_desc::Pass,
		+[]( uintptr_t out, b2BodyId bodyId ) { writeAABB( out, b2Body_ComputeAABB( bodyId ) ); } );
	function( "b2Body_GetMinExtent(bodyId)", &b2Body_GetMinExtent );
	function( "b2Body_GetMaxExtent(bodyId)", &b2Body_GetMaxExtent );
	function( "b2Body_GetMaxExtentOrigin(bodyId)", &b2Body_GetMaxExtentOrigin );
	function( "b2CreateCircleShape(bodyId, def, circle)", +[]( b2BodyId bodyId, b2ShapeDef def, b2Circle circle ) { return b2CreateCircleShape( bodyId, &def, &circle ); } );
	function( "b2CreateSegmentShape(bodyId, def, segment)", +[]( b2BodyId bodyId, b2ShapeDef def, b2Segment segment ) { return b2CreateSegmentShape( bodyId, &def, &segment ); } );
	function( "b2CreateChainSegmentShape(bodyId, def, chainSegment)", +[]( b2BodyId bodyId, b2ShapeDef def, b2ChainSegment chainSegment ) { return b2CreateChainSegmentShape( bodyId, &def, &chainSegment ); } );
	function( "b2CreateCapsuleShape(bodyId, def, capsule)", +[]( b2BodyId bodyId, b2ShapeDef def, b2Capsule capsule ) { return b2CreateCapsuleShape( bodyId, &def, &capsule ); } );
	function( "b2CreatePolygonShape(bodyId, def, polygon)", +[]( b2BodyId bodyId, b2ShapeDef def, b2Polygon polygon ) { return b2CreatePolygonShape( bodyId, &def, &polygon ); } );
	function( "b2DestroyShape(shapeId, updateBodyMass)", &b2DestroyShape );
	function( "b2Shape_IsValid(id)", &b2Shape_IsValid );
	function( "b2Shape_GetType(shapeId)", &b2Shape_GetType );
	function( "b2Shape_GetBody(shapeId)", &b2Shape_GetBody );
	function( "b2Shape_GetWorld(shapeId)", &b2Shape_GetWorld );
	function( "b2Shape_IsSensor(shapeId)", &b2Shape_IsSensor );
	function( "b2Shape_SetDensity(shapeId, density, updateBodyMass)", &b2Shape_SetDensity );
	function( "b2Shape_GetDensity(shapeId)", &b2Shape_GetDensity );
	function( "b2Shape_SetFriction(shapeId, friction)", &b2Shape_SetFriction );
	function( "b2Shape_GetFriction(shapeId)", &b2Shape_GetFriction );
	function( "b2Shape_SetRestitution(shapeId, restitution)", &b2Shape_SetRestitution );
	function( "b2Shape_GetRestitution(shapeId)", &b2Shape_GetRestitution );
	function( "b2Shape_SetUserMaterial(shapeId, material)", &b2Shape_SetUserMaterial );
	function( "b2Shape_GetUserMaterial(shapeId)", &b2Shape_GetUserMaterial );
	function( "b2Shape_SetSurfaceMaterial(shapeId, surfaceMaterial)", +[]( b2ShapeId shapeId, b2SurfaceMaterial surfaceMaterial ) { return b2Shape_SetSurfaceMaterial( shapeId, &surfaceMaterial ); } );
	function( "b2Shape_GetSurfaceMaterial(shapeId)", &b2Shape_GetSurfaceMaterial );
	function( "b2Shape_GetFilter(shapeId)", &b2Shape_GetFilter );
	function( "b2Shape_SetFilter(shapeId, filter)", &b2Shape_SetFilter );
	function( "b2Shape_EnableSensorEvents(shapeId, flag)", &b2Shape_EnableSensorEvents );
	function( "b2Shape_AreSensorEventsEnabled(shapeId)", &b2Shape_AreSensorEventsEnabled );
	function( "b2Shape_EnableContactEvents(shapeId, flag)", &b2Shape_EnableContactEvents );
	function( "b2Shape_AreContactEventsEnabled(shapeId)", &b2Shape_AreContactEventsEnabled );
	function( "b2Shape_EnablePreSolveEvents(shapeId, flag)", &b2Shape_EnablePreSolveEvents );
	function( "b2Shape_ArePreSolveEventsEnabled(shapeId)", &b2Shape_ArePreSolveEventsEnabled );
	function( "b2Shape_EnableHitEvents(shapeId, flag)", &b2Shape_EnableHitEvents );
	function( "b2Shape_AreHitEventsEnabled(shapeId)", &b2Shape_AreHitEventsEnabled );
	function( "b2Shape_TestPoint(shapeId, point)", &b2Shape_TestPoint );
	function( "b2Shape_RayCast(shapeId, origin, translation)", &b2Shape_RayCast );
	function( "b2Shape_GetCircle(shapeId)", &b2Shape_GetCircle );
	function( "b2Shape_GetSegment(shapeId)", &b2Shape_GetSegment );
	function( "b2Shape_GetChainSegment(shapeId)", &b2Shape_GetChainSegment );
	function( "b2Shape_GetCapsule(shapeId)", &b2Shape_GetCapsule );
	function( "b2Shape_GetPolygon(shapeId)", &b2Shape_GetPolygon );
	function( "b2Shape_SetCircle(shapeId, circle)", +[]( b2ShapeId shapeId, b2Circle circle ) { return b2Shape_SetCircle( shapeId, &circle ); } );
	function( "b2Shape_SetCapsule(shapeId, capsule)", +[]( b2ShapeId shapeId, b2Capsule capsule ) { return b2Shape_SetCapsule( shapeId, &capsule ); } );
	function( "b2Shape_SetSegment(shapeId, segment)", +[]( b2ShapeId shapeId, b2Segment segment ) { return b2Shape_SetSegment( shapeId, &segment ); } );
	function( "b2Shape_SetPolygon(shapeId, polygon)", +[]( b2ShapeId shapeId, b2Polygon polygon ) { return b2Shape_SetPolygon( shapeId, &polygon ); } );
	function( "b2Shape_SetChainSegment(shapeId, chainSegment)", +[]( b2ShapeId shapeId, b2ChainSegment chainSegment ) { return b2Shape_SetChainSegment( shapeId, &chainSegment ); } );
	function( "b2Shape_GetParentChain(shapeId)", &b2Shape_GetParentChain );
	function( "b2Shape_GetContactCapacity(shapeId)", &b2Shape_GetContactCapacity );
	function( "b2Shape_GetSensorCapacity(shapeId)", &b2Shape_GetSensorCapacity );
	out_function( "b2Shape_GetAABB(out, shapeId)", out_desc::AABB, out_desc::Pass,
		+[]( uintptr_t out, b2ShapeId shapeId ) { writeAABB( out, b2Shape_GetAABB( shapeId ) ); } );
	function( "b2Shape_ComputeMassData(shapeId)", &b2Shape_ComputeMassData );
	out_function( "b2Shape_GetClosestPoint(out, shapeId, target)", out_desc::Vec2, out_desc::Pass, out_desc::Pass,
		+[]( uintptr_t out, b2ShapeId shapeId, b2Pos target ) { writeVec2( out, b2Shape_GetClosestPoint( shapeId, target ) ); } );
	function( "b2Shape_ApplyWind(shapeId, wind, drag, lift, wake)", &b2Shape_ApplyWind );
	function( "b2DestroyChain(chainId)", &b2DestroyChain );
	function( "b2Chain_GetWorld(chainId)", &b2Chain_GetWorld );
	function( "b2Chain_GetSegmentCount(chainId)", &b2Chain_GetSegmentCount );
	function( "b2Chain_SetAllSurfaceMaterials(chainId, material)", +[]( b2ChainId chainId, b2SurfaceMaterial material ) { return b2Chain_SetAllSurfaceMaterials( chainId, &material ); } );
	function( "b2Chain_SetSurfaceMaterial(chainId, material, segmentIndex)", +[]( b2ChainId chainId, b2SurfaceMaterial material, int segmentIndex ) { return b2Chain_SetSurfaceMaterial( chainId, &material, segmentIndex ); } );
	function( "b2Chain_GetSurfaceMaterial(chainId, segmentIndex)", &b2Chain_GetSurfaceMaterial );
	function( "b2Chain_IsValid(id)", &b2Chain_IsValid );
	function( "b2DestroyJoint(jointId)", &b2DestroyJoint );
	function( "b2Joint_IsValid(id)", &b2Joint_IsValid );
	function( "b2Joint_GetType(jointId)", &b2Joint_GetType );
	function( "b2Joint_GetBodyA(jointId)", &b2Joint_GetBodyA );
	function( "b2Joint_GetBodyB(jointId)", &b2Joint_GetBodyB );
	function( "b2Joint_GetWorld(jointId)", &b2Joint_GetWorld );
	function( "b2Joint_SetLocalFrameA(jointId, localFrame)", &b2Joint_SetLocalFrameA );
	out_function( "b2Joint_GetLocalFrameA(outPosition, outRotation, jointId)", out_desc::Vec2, out_desc::Rot, out_desc::Pass,
		+[]( uintptr_t outPosition, uintptr_t outRotation, b2JointId jointId ) { b2Transform t = b2Joint_GetLocalFrameA( jointId ); writeVec2( outPosition, t.p ); writeRot( outRotation, t.q ); } );
	function( "b2Joint_SetLocalFrameB(jointId, localFrame)", &b2Joint_SetLocalFrameB );
	out_function( "b2Joint_GetLocalFrameB(outPosition, outRotation, jointId)", out_desc::Vec2, out_desc::Rot, out_desc::Pass,
		+[]( uintptr_t outPosition, uintptr_t outRotation, b2JointId jointId ) { b2Transform t = b2Joint_GetLocalFrameB( jointId ); writeVec2( outPosition, t.p ); writeRot( outRotation, t.q ); } );
	function( "b2Joint_SetCollideConnected(jointId, shouldCollide)", &b2Joint_SetCollideConnected );
	function( "b2Joint_GetCollideConnected(jointId)", &b2Joint_GetCollideConnected );
	function( "b2Joint_WakeBodies(jointId)", &b2Joint_WakeBodies );
	out_function( "b2Joint_GetConstraintForce(out, jointId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2JointId jointId ) { writeVec2( out, b2Joint_GetConstraintForce( jointId ) ); } );
	function( "b2Joint_GetConstraintTorque(jointId)", &b2Joint_GetConstraintTorque );
	function( "b2Joint_GetLinearSeparation(jointId)", &b2Joint_GetLinearSeparation );
	function( "b2Joint_GetAngularSeparation(jointId)", &b2Joint_GetAngularSeparation );
	function( "b2Joint_SetConstraintTuning(jointId, hertz, dampingRatio)", &b2Joint_SetConstraintTuning );
	function( "b2Joint_SetForceThreshold(jointId, threshold)", &b2Joint_SetForceThreshold );
	function( "b2Joint_GetForceThreshold(jointId)", &b2Joint_GetForceThreshold );
	function( "b2Joint_SetTorqueThreshold(jointId, threshold)", &b2Joint_SetTorqueThreshold );
	function( "b2Joint_GetTorqueThreshold(jointId)", &b2Joint_GetTorqueThreshold );
	function( "b2CreateDistanceJoint(worldId, def)", +[]( b2WorldId worldId, b2DistanceJointDef def ) { return b2CreateDistanceJoint( worldId, &def ); } );
	function( "b2DistanceJoint_SetLength(jointId, length)", &b2DistanceJoint_SetLength );
	function( "b2DistanceJoint_GetLength(jointId)", &b2DistanceJoint_GetLength );
	function( "b2DistanceJoint_EnableSpring(jointId, enableSpring)", &b2DistanceJoint_EnableSpring );
	function( "b2DistanceJoint_IsSpringEnabled(jointId)", &b2DistanceJoint_IsSpringEnabled );
	function( "b2DistanceJoint_SetSpringForceRange(jointId, lowerForce, upperForce)", &b2DistanceJoint_SetSpringForceRange );
	function( "b2DistanceJoint_SetSpringHertz(jointId, hertz)", &b2DistanceJoint_SetSpringHertz );
	function( "b2DistanceJoint_SetSpringDampingRatio(jointId, dampingRatio)", &b2DistanceJoint_SetSpringDampingRatio );
	function( "b2DistanceJoint_GetSpringHertz(jointId)", &b2DistanceJoint_GetSpringHertz );
	function( "b2DistanceJoint_GetSpringDampingRatio(jointId)", &b2DistanceJoint_GetSpringDampingRatio );
	function( "b2DistanceJoint_GetSpringForce(jointId)", &b2DistanceJoint_GetSpringForce );
	function( "b2DistanceJoint_EnableLimit(jointId, enableLimit)", &b2DistanceJoint_EnableLimit );
	function( "b2DistanceJoint_IsLimitEnabled(jointId)", &b2DistanceJoint_IsLimitEnabled );
	function( "b2DistanceJoint_SetLengthRange(jointId, minLength, maxLength)", &b2DistanceJoint_SetLengthRange );
	function( "b2DistanceJoint_GetMinLength(jointId)", &b2DistanceJoint_GetMinLength );
	function( "b2DistanceJoint_GetMaxLength(jointId)", &b2DistanceJoint_GetMaxLength );
	function( "b2DistanceJoint_GetCurrentLength(jointId)", &b2DistanceJoint_GetCurrentLength );
	function( "b2DistanceJoint_EnableMotor(jointId, enableMotor)", &b2DistanceJoint_EnableMotor );
	function( "b2DistanceJoint_IsMotorEnabled(jointId)", &b2DistanceJoint_IsMotorEnabled );
	function( "b2DistanceJoint_SetMotorSpeed(jointId, motorSpeed)", &b2DistanceJoint_SetMotorSpeed );
	function( "b2DistanceJoint_GetMotorSpeed(jointId)", &b2DistanceJoint_GetMotorSpeed );
	function( "b2DistanceJoint_SetMaxMotorForce(jointId, force)", &b2DistanceJoint_SetMaxMotorForce );
	function( "b2DistanceJoint_GetMaxMotorForce(jointId)", &b2DistanceJoint_GetMaxMotorForce );
	function( "b2DistanceJoint_GetMotorForce(jointId)", &b2DistanceJoint_GetMotorForce );
	function( "b2CreateFilterJoint(worldId, def)", +[]( b2WorldId worldId, b2FilterJointDef def ) { return b2CreateFilterJoint( worldId, &def ); } );
	function( "b2CreateMotorJoint(worldId, def)", +[]( b2WorldId worldId, b2MotorJointDef def ) { return b2CreateMotorJoint( worldId, &def ); } );
	function( "b2MotorJoint_SetLinearVelocity(jointId, velocity)", &b2MotorJoint_SetLinearVelocity );
	out_function( "b2MotorJoint_GetLinearVelocity(out, jointId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2JointId jointId ) { writeVec2( out, b2MotorJoint_GetLinearVelocity( jointId ) ); } );
	function( "b2MotorJoint_SetAngularVelocity(jointId, velocity)", &b2MotorJoint_SetAngularVelocity );
	function( "b2MotorJoint_GetAngularVelocity(jointId)", &b2MotorJoint_GetAngularVelocity );
	function( "b2MotorJoint_SetMaxVelocityForce(jointId, maxForce)", &b2MotorJoint_SetMaxVelocityForce );
	function( "b2MotorJoint_GetMaxVelocityForce(jointId)", &b2MotorJoint_GetMaxVelocityForce );
	function( "b2MotorJoint_SetMaxVelocityTorque(jointId, maxTorque)", &b2MotorJoint_SetMaxVelocityTorque );
	function( "b2MotorJoint_GetMaxVelocityTorque(jointId)", &b2MotorJoint_GetMaxVelocityTorque );
	function( "b2MotorJoint_SetLinearHertz(jointId, hertz)", &b2MotorJoint_SetLinearHertz );
	function( "b2MotorJoint_GetLinearHertz(jointId)", &b2MotorJoint_GetLinearHertz );
	function( "b2MotorJoint_SetLinearDampingRatio(jointId, damping)", &b2MotorJoint_SetLinearDampingRatio );
	function( "b2MotorJoint_GetLinearDampingRatio(jointId)", &b2MotorJoint_GetLinearDampingRatio );
	function( "b2MotorJoint_SetAngularHertz(jointId, hertz)", &b2MotorJoint_SetAngularHertz );
	function( "b2MotorJoint_GetAngularHertz(jointId)", &b2MotorJoint_GetAngularHertz );
	function( "b2MotorJoint_SetAngularDampingRatio(jointId, damping)", &b2MotorJoint_SetAngularDampingRatio );
	function( "b2MotorJoint_GetAngularDampingRatio(jointId)", &b2MotorJoint_GetAngularDampingRatio );
	function( "b2MotorJoint_SetMaxSpringForce(jointId, maxForce)", &b2MotorJoint_SetMaxSpringForce );
	function( "b2MotorJoint_GetMaxSpringForce(jointId)", &b2MotorJoint_GetMaxSpringForce );
	function( "b2MotorJoint_SetMaxSpringTorque(jointId, maxTorque)", &b2MotorJoint_SetMaxSpringTorque );
	function( "b2MotorJoint_GetMaxSpringTorque(jointId)", &b2MotorJoint_GetMaxSpringTorque );
	function( "b2CreateMoverJoint(worldId, def)", +[]( b2WorldId worldId, b2MoverJointDef def ) { return b2CreateMoverJoint( worldId, &def ); } );
	function( "b2MoverJoint_SetLinearVelocity(jointId, velocity)", &b2MoverJoint_SetLinearVelocity );
	out_function( "b2MoverJoint_GetLinearVelocity(out, jointId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2JointId jointId ) { writeVec2( out, b2MoverJoint_GetLinearVelocity( jointId ) ); } );
	function( "b2MoverJoint_SetMaxVelocityForce(jointId, maxForce)", &b2MoverJoint_SetMaxVelocityForce );
	out_function( "b2MoverJoint_GetMaxVelocityForce(out, jointId)", out_desc::Vec2, out_desc::Pass,
		+[]( uintptr_t out, b2JointId jointId ) { writeVec2( out, b2MoverJoint_GetMaxVelocityForce( jointId ) ); } );
	function( "b2CreatePogoJoint(worldId, def)", +[]( b2WorldId worldId, b2PogoJointDef def ) { return b2CreatePogoJoint( worldId, &def ); } );
	function( "b2PogoJoint_SetRestLength(jointId, length)", &b2PogoJoint_SetRestLength );
	function( "b2PogoJoint_GetRestLength(jointId)", &b2PogoJoint_GetRestLength );
	function( "b2PogoJoint_SetSpringHertz(jointId, hertz)", &b2PogoJoint_SetSpringHertz );
	function( "b2PogoJoint_GetSpringHertz(jointId)", &b2PogoJoint_GetSpringHertz );
	function( "b2PogoJoint_SetSpringDampingRatio(jointId, dampingRatio)", &b2PogoJoint_SetSpringDampingRatio );
	function( "b2PogoJoint_GetSpringDampingRatio(jointId)", &b2PogoJoint_GetSpringDampingRatio );
	function( "b2PogoJoint_GetLength(jointId)", &b2PogoJoint_GetLength );
	function( "b2PogoJoint_GetVelocity(jointId)", &b2PogoJoint_GetVelocity );
	function( "b2PogoJoint_GetImpulse(jointId)", &b2PogoJoint_GetImpulse );
	function( "b2CreatePrismaticJoint(worldId, def)", +[]( b2WorldId worldId, b2PrismaticJointDef def ) { return b2CreatePrismaticJoint( worldId, &def ); } );
	function( "b2PrismaticJoint_EnableSpring(jointId, enableSpring)", &b2PrismaticJoint_EnableSpring );
	function( "b2PrismaticJoint_IsSpringEnabled(jointId)", &b2PrismaticJoint_IsSpringEnabled );
	function( "b2PrismaticJoint_SetSpringHertz(jointId, hertz)", &b2PrismaticJoint_SetSpringHertz );
	function( "b2PrismaticJoint_GetSpringHertz(jointId)", &b2PrismaticJoint_GetSpringHertz );
	function( "b2PrismaticJoint_SetSpringDampingRatio(jointId, dampingRatio)", &b2PrismaticJoint_SetSpringDampingRatio );
	function( "b2PrismaticJoint_GetSpringDampingRatio(jointId)", &b2PrismaticJoint_GetSpringDampingRatio );
	function( "b2PrismaticJoint_SetTargetTranslation(jointId, translation)", &b2PrismaticJoint_SetTargetTranslation );
	function( "b2PrismaticJoint_GetTargetTranslation(jointId)", &b2PrismaticJoint_GetTargetTranslation );
	function( "b2PrismaticJoint_EnableLimit(jointId, enableLimit)", &b2PrismaticJoint_EnableLimit );
	function( "b2PrismaticJoint_IsLimitEnabled(jointId)", &b2PrismaticJoint_IsLimitEnabled );
	function( "b2PrismaticJoint_GetLowerLimit(jointId)", &b2PrismaticJoint_GetLowerLimit );
	function( "b2PrismaticJoint_GetUpperLimit(jointId)", &b2PrismaticJoint_GetUpperLimit );
	function( "b2PrismaticJoint_SetLimits(jointId, lower, upper)", &b2PrismaticJoint_SetLimits );
	function( "b2PrismaticJoint_EnableMotor(jointId, enableMotor)", &b2PrismaticJoint_EnableMotor );
	function( "b2PrismaticJoint_IsMotorEnabled(jointId)", &b2PrismaticJoint_IsMotorEnabled );
	function( "b2PrismaticJoint_SetMotorSpeed(jointId, motorSpeed)", &b2PrismaticJoint_SetMotorSpeed );
	function( "b2PrismaticJoint_GetMotorSpeed(jointId)", &b2PrismaticJoint_GetMotorSpeed );
	function( "b2PrismaticJoint_SetMaxMotorForce(jointId, force)", &b2PrismaticJoint_SetMaxMotorForce );
	function( "b2PrismaticJoint_GetMaxMotorForce(jointId)", &b2PrismaticJoint_GetMaxMotorForce );
	function( "b2PrismaticJoint_GetMotorForce(jointId)", &b2PrismaticJoint_GetMotorForce );
	function( "b2PrismaticJoint_GetTranslation(jointId)", &b2PrismaticJoint_GetTranslation );
	function( "b2PrismaticJoint_GetSpeed(jointId)", &b2PrismaticJoint_GetSpeed );
	function( "b2CreateRevoluteJoint(worldId, def)", +[]( b2WorldId worldId, b2RevoluteJointDef def ) { return b2CreateRevoluteJoint( worldId, &def ); } );
	function( "b2RevoluteJoint_EnableSpring(jointId, enableSpring)", &b2RevoluteJoint_EnableSpring );
	function( "b2RevoluteJoint_IsSpringEnabled(jointId)", &b2RevoluteJoint_IsSpringEnabled );
	function( "b2RevoluteJoint_SetSpringHertz(jointId, hertz)", &b2RevoluteJoint_SetSpringHertz );
	function( "b2RevoluteJoint_GetSpringHertz(jointId)", &b2RevoluteJoint_GetSpringHertz );
	function( "b2RevoluteJoint_SetSpringDampingRatio(jointId, dampingRatio)", &b2RevoluteJoint_SetSpringDampingRatio );
	function( "b2RevoluteJoint_GetSpringDampingRatio(jointId)", &b2RevoluteJoint_GetSpringDampingRatio );
	function( "b2RevoluteJoint_SetTargetAngle(jointId, angle)", &b2RevoluteJoint_SetTargetAngle );
	function( "b2RevoluteJoint_GetTargetAngle(jointId)", &b2RevoluteJoint_GetTargetAngle );
	function( "b2RevoluteJoint_GetAngle(jointId)", &b2RevoluteJoint_GetAngle );
	function( "b2RevoluteJoint_EnableLimit(jointId, enableLimit)", &b2RevoluteJoint_EnableLimit );
	function( "b2RevoluteJoint_IsLimitEnabled(jointId)", &b2RevoluteJoint_IsLimitEnabled );
	function( "b2RevoluteJoint_GetLowerLimit(jointId)", &b2RevoluteJoint_GetLowerLimit );
	function( "b2RevoluteJoint_GetUpperLimit(jointId)", &b2RevoluteJoint_GetUpperLimit );
	function( "b2RevoluteJoint_SetLimits(jointId, lower, upper)", &b2RevoluteJoint_SetLimits );
	function( "b2RevoluteJoint_EnableMotor(jointId, enableMotor)", &b2RevoluteJoint_EnableMotor );
	function( "b2RevoluteJoint_IsMotorEnabled(jointId)", &b2RevoluteJoint_IsMotorEnabled );
	function( "b2RevoluteJoint_SetMotorSpeed(jointId, motorSpeed)", &b2RevoluteJoint_SetMotorSpeed );
	function( "b2RevoluteJoint_GetMotorSpeed(jointId)", &b2RevoluteJoint_GetMotorSpeed );
	function( "b2RevoluteJoint_GetMotorTorque(jointId)", &b2RevoluteJoint_GetMotorTorque );
	function( "b2RevoluteJoint_SetMaxMotorTorque(jointId, torque)", &b2RevoluteJoint_SetMaxMotorTorque );
	function( "b2RevoluteJoint_GetMaxMotorTorque(jointId)", &b2RevoluteJoint_GetMaxMotorTorque );
	function( "b2CreateWeldJoint(worldId, def)", +[]( b2WorldId worldId, b2WeldJointDef def ) { return b2CreateWeldJoint( worldId, &def ); } );
	function( "b2WeldJoint_SetLinearHertz(jointId, hertz)", &b2WeldJoint_SetLinearHertz );
	function( "b2WeldJoint_GetLinearHertz(jointId)", &b2WeldJoint_GetLinearHertz );
	function( "b2WeldJoint_SetLinearDampingRatio(jointId, dampingRatio)", &b2WeldJoint_SetLinearDampingRatio );
	function( "b2WeldJoint_GetLinearDampingRatio(jointId)", &b2WeldJoint_GetLinearDampingRatio );
	function( "b2WeldJoint_SetAngularHertz(jointId, hertz)", &b2WeldJoint_SetAngularHertz );
	function( "b2WeldJoint_GetAngularHertz(jointId)", &b2WeldJoint_GetAngularHertz );
	function( "b2WeldJoint_SetAngularDampingRatio(jointId, dampingRatio)", &b2WeldJoint_SetAngularDampingRatio );
	function( "b2WeldJoint_GetAngularDampingRatio(jointId)", &b2WeldJoint_GetAngularDampingRatio );
	function( "b2CreateWheelJoint(worldId, def)", +[]( b2WorldId worldId, b2WheelJointDef def ) { return b2CreateWheelJoint( worldId, &def ); } );
	function( "b2WheelJoint_EnableSpring(jointId, enableSpring)", &b2WheelJoint_EnableSpring );
	function( "b2WheelJoint_IsSpringEnabled(jointId)", &b2WheelJoint_IsSpringEnabled );
	function( "b2WheelJoint_SetSpringHertz(jointId, hertz)", &b2WheelJoint_SetSpringHertz );
	function( "b2WheelJoint_GetSpringHertz(jointId)", &b2WheelJoint_GetSpringHertz );
	function( "b2WheelJoint_SetSpringDampingRatio(jointId, dampingRatio)", &b2WheelJoint_SetSpringDampingRatio );
	function( "b2WheelJoint_GetSpringDampingRatio(jointId)", &b2WheelJoint_GetSpringDampingRatio );
	function( "b2WheelJoint_EnableLimit(jointId, enableLimit)", &b2WheelJoint_EnableLimit );
	function( "b2WheelJoint_IsLimitEnabled(jointId)", &b2WheelJoint_IsLimitEnabled );
	function( "b2WheelJoint_GetLowerLimit(jointId)", &b2WheelJoint_GetLowerLimit );
	function( "b2WheelJoint_GetUpperLimit(jointId)", &b2WheelJoint_GetUpperLimit );
	function( "b2WheelJoint_SetLimits(jointId, lower, upper)", &b2WheelJoint_SetLimits );
	function( "b2WheelJoint_EnableMotor(jointId, enableMotor)", &b2WheelJoint_EnableMotor );
	function( "b2WheelJoint_IsMotorEnabled(jointId)", &b2WheelJoint_IsMotorEnabled );
	function( "b2WheelJoint_SetMotorSpeed(jointId, motorSpeed)", &b2WheelJoint_SetMotorSpeed );
	function( "b2WheelJoint_GetMotorSpeed(jointId)", &b2WheelJoint_GetMotorSpeed );
	function( "b2WheelJoint_SetMaxMotorTorque(jointId, torque)", &b2WheelJoint_SetMaxMotorTorque );
	function( "b2WheelJoint_GetMaxMotorTorque(jointId)", &b2WheelJoint_GetMaxMotorTorque );
	function( "b2WheelJoint_GetMotorTorque(jointId)", &b2WheelJoint_GetMotorTorque );
	function( "b2Contact_IsValid(id)", &b2Contact_IsValid );
	function( "b2Contact_GetData(contactId)", &b2Contact_GetData );

	// ======================================================================
	// Functions that take callbacks, pointers, arrays, strings or handles
	// ======================================================================

	// ---- base.h ----
	// b2SetAllocator(allocFcn, freeFcn): allocFcn(size, alignment) returns a wasm heap address
	// (a multiple of alignment, e.g. from _malloc), freeFcn(mem, size) releases it. Pass null
	// for both to go back to Box2D's default allocator.
	ret_function( "b2SetAllocator(allocFcn: ((size: number, alignment: number) => number) | null, freeFcn: ((mem: number, size: number) => void) | null): void",
		+[]( val allocFcn, val freeFcn )
		{
			setHeld( g_allocFcn, allocFcn );
			setHeld( g_freeFcn, freeFcn );
			bool on = g_allocFcn != nullptr && g_freeFcn != nullptr;
			b2SetAllocator( on ? allocTrampoline : nullptr, on ? freeTrampoline : nullptr );
		} );
	ret_function( "b2SetAssertFcn(assertFcn: (condition: string, fileName: string, lineNumber: number) => number): void", +[]( val assertFcn )
	{
		setHeld( g_assertFcn, assertFcn );
		b2SetAssertFcn( assertTrampoline );
	} );
	ret_function( "b2SetLogFcn(logFcn: (message: string) => void): void", +[]( val logFcn )
	{
		setHeld( g_logFcn, logFcn );
		b2SetLogFcn( logTrampoline );
	} );
#if !defined( NDEBUG ) || defined( B2_ENABLE_ASSERT )
	function( "b2InternalAssert(condition, fileName, lineNumber)", +[]( std::string condition, std::string fileName, int lineNumber )
		{ return b2InternalAssert( condition.c_str(), fileName.c_str(), lineNumber ); } );
#endif
	// The C function returns the milliseconds and resets *ticks to now.
	ret_function( "b2GetMillisecondsAndReset(ticks): { milliseconds: number, ticks: bigint }", +[]( uint64_t ticks ) -> val
	{
		float ms = b2GetMillisecondsAndReset( &ticks );
		val o = val::object();
		o.set( "milliseconds", ms );
		o.set( "ticks", ticks );
		return o;
	} );
	ret_function( "b2Hash(hash, data: ArrayLike<number>): number", +[]( uint32_t hash, val data ) -> uint32_t
	{
		std::vector<uint8_t> bytes = convertJSArrayToNumberVector<uint8_t>( data );
		return b2Hash( hash, bytes.data(), (int)bytes.size() );
	} );

	// ---- math_functions.h ----
	// The C function returns the unit vector and writes the length through a pointer.
	ret_function( "b2GetLengthAndNormalize(a): { length: number, normalized: b2Vec2 }", +[]( b2Vec2 a ) -> val
	{
		float length = 0.0f;
		b2Vec2 n = b2GetLengthAndNormalize( &length, a );
		val o = val::object();
		o.set( "length", length );
		o.set( "normalized", val( n ) );
		return o;
	} );
	ret_function( "b2MakeAABB(points: ArrayLike<number>, radius): b2AABB", +[]( val points, float radius )
	{
		std::vector<b2Vec2> pts = toPoints( points );
		return b2MakeAABB( pts.data(), (int)pts.size(), radius );
	} );

	// ---- id.h ----
	ret_function( "b2StoreContactId(id): [ number, number, number ]", +[]( b2ContactId id ) -> val
	{
		uint32_t values[3];
		b2StoreContactId( id, values );
		val a = val::array();
		for ( uint32_t v : values ) a.call<void>( "push", v );
		return a;
	} );
	ret_function( "b2LoadContactId(values: [ number, number, number ]): b2ContactId", +[]( val values )
	{
		uint32_t v[3] = { values[0].as<uint32_t>(), values[1].as<uint32_t>(), values[2].as<uint32_t>() };
		return b2LoadContactId( v );
	} );

	// ---- collision.h: geometry ----
	ret_function( "b2ComputeHull(points: ArrayLike<number>): b2Hull", +[]( val points )
	{
		std::vector<b2Vec2> pts = toPoints( points );
		return b2ComputeHull( pts.data(), (int)pts.size() );
	} );
	ret_function( "b2MakeProxy(points: ArrayLike<number>, radius): b2ShapeProxy", +[]( val points, float radius )
	{
		std::vector<b2Vec2> pts = toPoints( points );
		return b2MakeProxy( pts.data(), (int)pts.size(), radius );
	} );
	ret_function( "b2MakeOffsetProxy(points: ArrayLike<number>, radius, position, rotation): b2ShapeProxy",
		+[]( val points, float radius, b2Vec2 position, b2Rot rotation )
		{
			std::vector<b2Vec2> pts = toPoints( points );
			return b2MakeOffsetProxy( pts.data(), (int)pts.size(), radius, position, rotation );
		} );

	// ---- collision.h: distance ----
	// cache is the caller's b2SimplexCache object, read before and updated after (in/out, as
	// in C). simplexes, when an array, receives up to simplexCapacity b2Simplex records for
	// debugging GJK; output.simplexCount says how many.
	ret_function( "b2ShapeDistance(input, cache: b2SimplexCache, simplexes: b2Simplex[] | null, simplexCapacity): b2DistanceOutput",
		+[]( b2DistanceInput input, val cache, val simplexes, int simplexCapacity )
		{
			b2SimplexCache c = readCache( cache );
			std::vector<b2Simplex> s( simplexCapacity > 0 ? (size_t)simplexCapacity : 0 );
			b2DistanceOutput out = b2ShapeDistance( &input, &c, s.empty() ? nullptr : s.data(), (int)s.size() );
			writeCache( cache, c );
			if ( !simplexes.isNull() && !simplexes.isUndefined() )
			{
				simplexes.set( "length", 0 );
				for ( int i = 0; i < out.simplexCount && i < (int)s.size(); ++i ) simplexes.call<void>( "push", val( s[i] ) );
			}
			return out;
		} );

	// ---- collision.h: manifolds with a simplex cache ----
	ret_function( "b2CollideChainSegmentAndCapsule(segmentA, capsuleB, xf, cache: b2SimplexCache): b2LocalManifold",
		+[]( b2ChainSegment segmentA, b2Capsule capsuleB, b2Transform xf, val cache )
		{
			b2SimplexCache c = readCache( cache );
			b2LocalManifold m = b2CollideChainSegmentAndCapsule( &segmentA, &capsuleB, xf, &c );
			writeCache( cache, c );
			return m;
		} );
	ret_function( "b2CollideChainSegmentAndPolygon(segmentA, polygonB, xf, cache: b2SimplexCache): b2LocalManifold",
		+[]( b2ChainSegment segmentA, b2Polygon polygonB, b2Transform xf, val cache )
		{
			b2SimplexCache c = readCache( cache );
			b2LocalManifold m = b2CollideChainSegmentAndPolygon( &segmentA, &polygonB, xf, &c );
			writeCache( cache, c );
			return m;
		} );

	// ---- collision.h: dynamic tree ----
	// b2DynamicTree owns heap memory: b2CreateDynamicTree returns an opaque handle (the C
	// function returns the struct by value; the binding keeps it on the wasm heap), freed by
	// b2DestroyDynamicTree.
	class_<b2DynamicTree>( "b2DynamicTree" );
	function( "b2CreateDynamicTree(proxyCapacity)", +[]( int proxyCapacity ) -> b2DynamicTree*
	{
		b2DynamicTree* tree = new b2DynamicTree();
		*tree = b2CreateDynamicTree( proxyCapacity );
		return tree;
	}, allow_raw_pointers() );
	function( "b2DestroyDynamicTree(tree)", +[]( b2DynamicTree* tree )
	{
		b2DestroyDynamicTree( tree );
		delete tree;
	}, allow_raw_pointers() );
	function( "b2CreateTreeProxy(tree, aabb, categoryBits, userData)", +[]( b2DynamicTree* tree, b2AABB aabb, uint64_t categoryBits, uint64_t userData )
		{ return b2CreateTreeProxy( tree, aabb, categoryBits, userData ); }, allow_raw_pointers() );
	function( "b2DestroyTreeProxy(tree, proxyId)", +[]( b2DynamicTree* tree, int proxyId ) { b2DestroyTreeProxy( tree, proxyId ); }, allow_raw_pointers() );
	function( "b2DynamicTree_MoveProxy(tree, proxyId, aabb)", +[]( b2DynamicTree* tree, int proxyId, b2AABB aabb )
		{ b2DynamicTree_MoveProxy( tree, proxyId, aabb ); }, allow_raw_pointers() );
	function( "b2DynamicTree_SetCategoryBits(tree, proxyId, categoryBits)", +[]( b2DynamicTree* tree, int proxyId, uint64_t categoryBits )
		{ b2DynamicTree_SetCategoryBits( tree, proxyId, categoryBits ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetCategoryBits(tree, proxyId)", +[]( b2DynamicTree* tree, int proxyId )
		{ return b2DynamicTree_GetCategoryBits( tree, proxyId ); }, allow_raw_pointers() );
	ret_function( "b2DynamicTree_Query(tree, aabb, maskBits, callback: (proxyId: number, userData: bigint) => boolean | void): b2TreeStats",
		+[]( b2DynamicTree* tree, b2AABB aabb, uint64_t maskBits, val cb )
		{
			return b2DynamicTree_Query( tree, aabb, maskBits,
				[]( int proxyId, uint64_t userData, void* ctx ) -> bool
				{
					val r = ( *static_cast<val*>( ctx ) )( proxyId, userData );
					return r.isUndefined() ? true : r.as<bool>();
				},
				&cb );
		}, allow_raw_pointers() );
	ret_function( "b2DynamicTree_QueryAll(tree, aabb, callback: (proxyId: number, userData: bigint) => boolean | void): b2TreeStats",
		+[]( b2DynamicTree* tree, b2AABB aabb, val cb )
		{
			return b2DynamicTree_QueryAll( tree, aabb,
				[]( int proxyId, uint64_t userData, void* ctx ) -> bool
				{
					val r = ( *static_cast<val*>( ctx ) )( proxyId, userData );
					return r.isUndefined() ? true : r.as<bool>();
				},
				&cb );
		}, allow_raw_pointers() );
	ret_function( "b2DynamicTree_CastRay(tree, input, maskBits, callback: (input: b2RayCastInput, proxyId: number, userData: bigint) => number): b2TreeStats",
		+[]( b2DynamicTree* tree, b2RayCastInput input, uint64_t maskBits, val cb )
		{
			return b2DynamicTree_CastRay( tree, &input, maskBits,
				[]( const b2RayCastInput* in, int proxyId, uint64_t userData, void* ctx ) -> float
				{
					val r = ( *static_cast<val*>( ctx ) )( *in, proxyId, userData );
					return r.isUndefined() ? in->maxFraction : r.as<float>();
				},
				&cb );
		}, allow_raw_pointers() );
	ret_function( "b2DynamicTree_CastBox(tree, input, maskBits, callback: (input: b2BoxCastInput, proxyId: number, userData: bigint) => number): b2TreeStats",
		+[]( b2DynamicTree* tree, b2BoxCastInput input, uint64_t maskBits, val cb )
		{
			return b2DynamicTree_CastBox( tree, &input, maskBits,
				[]( const b2BoxCastInput* in, int proxyId, uint64_t userData, void* ctx ) -> float
				{
					val r = ( *static_cast<val*>( ctx ) )( *in, proxyId, userData );
					return r.isUndefined() ? in->maxFraction : r.as<float>();
				},
				&cb );
		}, allow_raw_pointers() );
	function( "b2DynamicTree_GetHeight(tree)", +[]( b2DynamicTree* tree ) { return b2DynamicTree_GetHeight( tree ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetAreaRatio(tree)", +[]( b2DynamicTree* tree ) { return b2DynamicTree_GetAreaRatio( tree ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetRootBounds(tree)", +[]( b2DynamicTree* tree ) { return b2DynamicTree_GetRootBounds( tree ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetProxyCount(tree)", +[]( b2DynamicTree* tree ) { return b2DynamicTree_GetProxyCount( tree ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetByteCount(tree)", +[]( b2DynamicTree* tree ) { return b2DynamicTree_GetByteCount( tree ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetUserData(tree, proxyId)", +[]( b2DynamicTree* tree, int proxyId ) { return b2DynamicTree_GetUserData( tree, proxyId ); }, allow_raw_pointers() );
	function( "b2DynamicTree_GetAABB(tree, proxyId)", +[]( b2DynamicTree* tree, int proxyId ) { return b2DynamicTree_GetAABB( tree, proxyId ); }, allow_raw_pointers() );
	function( "b2DynamicTree_Validate(tree)", +[]( b2DynamicTree* tree ) { b2DynamicTree_Validate( tree ); }, allow_raw_pointers() );

	// ---- collision.h: character mover ----
	// b2SolvePlanes writes each plane's push; the results land back on the caller's plane
	// objects, as they do in the caller's C array.
	ret_function( "b2SolvePlanes(targetDelta, planes: b2CollisionPlane[]): b2PlaneSolverResult", +[]( b2Vec2 targetDelta, val planes )
	{
		std::vector<b2CollisionPlane> p = readPlanes( planes );
		b2PlaneSolverResult result = b2SolvePlanes( targetDelta, p.data(), (int)p.size() );
		for ( size_t i = 0; i < p.size(); ++i ) planes[i].set( "push", p[i].push );
		return result;
	} );
	ret_function( "b2ClipVector(vector, planes: b2CollisionPlane[]): b2Vec2", +[]( b2Vec2 vector, val planes )
	{
		std::vector<b2CollisionPlane> p = readPlanes( planes );
		return b2ClipVector( vector, p.data(), (int)p.size() );
	} );

	// ---- box2d.h: world ----
	// frictionCallback / restitutionCallback on the def are installed on the new world.
	ret_function( "b2CreateWorld(def: b2WorldDef): b2WorldId", +[]( val def )
	{
		b2WorldDef d = def.as<b2WorldDef>();
		b2WorldId worldId = b2CreateWorld( &d );
		if ( B2_IS_NON_NULL( worldId ) )
		{
			clearCallbacks( worldId.index1 - 1 );
			val friction = def["frictionCallback"];
			val restitution = def["restitutionCallback"];
			if ( isFn( friction ) ) setFrictionCallback( worldId, friction );
			if ( isFn( restitution ) ) setRestitutionCallback( worldId, restitution );
		}
		return worldId;
	} );
	function( "b2DestroyWorld(worldId)", +[]( b2WorldId worldId )
	{
		bool valid = b2World_IsValid( worldId );
		b2DestroyWorld( worldId );
		if ( valid ) clearCallbacks( worldId.index1 - 1 );
	} );

	ret_function( "b2World_Draw(worldId, draw: b2DebugDraw): void", +[]( b2WorldId worldId, val draw )
	{
		JsDebugDraw jd{ draw };
		b2DebugDraw dd = makeDebugDraw( jd );
		b2World_Draw( worldId, &dd );
	} );

	ret_function( "b2World_OverlapAABB(worldId, origin, aabb, filter, fcn: (shapeId: b2ShapeId) => boolean | void): b2TreeStats",
		+[]( b2WorldId worldId, b2Pos origin, b2AABB aabb, b2QueryFilter filter, val cb )
		{
			return b2World_OverlapAABB( worldId, origin, aabb, filter,
				[]( b2ShapeId shapeId, void* ctx ) -> bool
				{
					val r = ( *static_cast<val*>( ctx ) )( shapeId );
					return r.isUndefined() ? true : r.as<bool>();
				},
				&cb );
		} );
	ret_function( "b2World_OverlapShape(worldId, origin, proxy, filter, fcn: (shapeId: b2ShapeId) => boolean | void): b2TreeStats",
		+[]( b2WorldId worldId, b2Pos origin, b2ShapeProxy proxy, b2QueryFilter filter, val cb )
		{
			return b2World_OverlapShape( worldId, origin, &proxy, filter,
				[]( b2ShapeId shapeId, void* ctx ) -> bool
				{
					val r = ( *static_cast<val*>( ctx ) )( shapeId );
					return r.isUndefined() ? true : r.as<bool>();
				},
				&cb );
		} );
	ret_function( "b2World_CastRay(worldId, origin, translation, filter, fcn: (shapeId: b2ShapeId, point: b2Vec2, normal: b2Vec2, fraction: number) => number): b2TreeStats",
		+[]( b2WorldId worldId, b2Pos origin, b2Vec2 translation, b2QueryFilter filter, val cb )
		{
			return b2World_CastRay( worldId, origin, translation, filter,
				[]( b2ShapeId shapeId, b2Pos point, b2Vec2 normal, float fraction, void* ctx ) -> float
				{
					val r = ( *static_cast<val*>( ctx ) )( shapeId, point, normal, fraction );
					return r.isUndefined() ? 1.0f : r.as<float>();
				},
				&cb );
		} );
	ret_function( "b2World_CastShape(worldId, origin, proxy, translation, filter, fcn: (shapeId: b2ShapeId, point: b2Vec2, normal: b2Vec2, fraction: number) => number): b2TreeStats",
		+[]( b2WorldId worldId, b2Pos origin, b2ShapeProxy proxy, b2Vec2 translation, b2QueryFilter filter, val cb )
		{
			return b2World_CastShape( worldId, origin, &proxy, translation, filter,
				[]( b2ShapeId shapeId, b2Pos point, b2Vec2 normal, float fraction, void* ctx ) -> float
				{
					val r = ( *static_cast<val*>( ctx ) )( shapeId, point, normal, fraction );
					return r.isUndefined() ? 1.0f : r.as<float>();
				},
				&cb );
		} );
	// Each plane reaches the callback as a packed buffer { count: 1, data: Float32Array }
	// (layout::plane floats: plane.normal, plane.offset, point, hit), read with
	// createPlaneResult / getPlaneResultAt, as box3d.js hands its mover planes over.
	ret_function( "b2World_CollideMover(worldId, origin, mover, filter, fcn: (shapeId: b2ShapeId, planes: PlaneResultBuffer) => boolean | void): void",
		+[]( b2WorldId worldId, b2Pos origin, b2Capsule mover, b2QueryFilter filter, val cb )
		{
			b2World_CollideMover( worldId, origin, &mover, filter,
				[]( b2ShapeId shapeId, const b2PlaneResult* pr, void* ctx ) -> bool
				{
					float packed[layout::plane] = { pr->plane.normal.x, pr->plane.normal.y, pr->plane.offset,
													pr->point.x, pr->point.y, pr->hit ? 1.0f : 0.0f };
					val buf = val::object();
					buf.set( "count", 1 );
					buf.set( "data", toF32( packed, layout::plane ) );
					val r = ( *static_cast<val*>( ctx ) )( shapeId, buf );
					return r.isUndefined() ? true : r.as<bool>();
				},
				&cb );
		} );

	ret_function( "b2World_SetCustomFilterCallback(worldId, fcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId) => boolean | void) | null): void",
		+[]( b2WorldId worldId, val fcn )
		{
			WorldCallbacks& c = callbacksOf( worldId );
			setHeld( c.customFilter, fcn );
			b2World_SetCustomFilterCallback( worldId, c.customFilter ? customFilterTrampoline : nullptr, c.customFilter );
		} );
	ret_function( "b2World_SetPreSolveCallback(worldId, preSolveFcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId, manifold: b2Manifold) => void) | null, preContinuousFcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId, point: b2Vec2, normal: b2Vec2) => boolean | void) | null): void",
		+[]( b2WorldId worldId, val preSolveFcn, val preContinuousFcn )
		{
			WorldCallbacks& c = callbacksOf( worldId );
			setHeld( c.preSolve, preSolveFcn );
			setHeld( c.preContinuous, preContinuousFcn );
			b2World_SetPreSolveCallback( worldId, c.preSolve ? preSolveTrampoline : nullptr,
				c.preContinuous ? preContinuousTrampoline : nullptr, &c );
		} );
	ret_function( "b2World_SetFrictionCallback(worldId, callback: ((frictionA: number, userMaterialIdA: bigint, frictionB: number, userMaterialIdB: bigint) => number) | null): void",
		&setFrictionCallback );
	ret_function( "b2World_SetRestitutionCallback(worldId, callback: ((restitutionA: number, userMaterialIdA: bigint, restitutionB: number, userMaterialIdB: bigint) => number) | null): void",
		&setRestitutionCallback );
	function( "b2World_SetUserData(worldId, userData)", +[]( b2WorldId worldId, uintptr_t userData ) { b2World_SetUserData( worldId, (void*)userData ); } );
	function( "b2World_GetUserData(worldId)", +[]( b2WorldId worldId ) { return (uintptr_t)b2World_GetUserData( worldId ); } );

	// ---- box2d.h: recording (in memory; the file helpers b2SaveRecordingToFile and
	// b2LoadRecordingFromFile need a filesystem, which this build does not link) ----
	function( "b2CreateRecording(byteCapacity)", +[]( int byteCapacity ) { return reinterpret_cast<uintptr_t>( b2CreateRecording( byteCapacity ) ); } );
	function( "b2DestroyRecording(recording)", +[]( uintptr_t recording ) { b2DestroyRecording( asRecording( recording ) ); } );
	// A copy of the recorded bytes.
	ret_function( "b2Recording_GetData(recording): Uint8Array", +[]( uintptr_t recording ) -> val
	{
		const b2Recording* r = asRecording( recording );
		return toU8( b2Recording_GetData( r ), b2Recording_GetSize( r ) );
	} );
	function( "b2Recording_GetSize(recording)", +[]( uintptr_t recording ) { return b2Recording_GetSize( asRecording( recording ) ); } );
	function( "b2World_StartRecording(worldId, recording)", +[]( b2WorldId worldId, uintptr_t recording )
		{ b2World_StartRecording( worldId, asRecording( recording ) ); } );

	// ---- box2d.h: snapshot ----
	// b2World_GetSnapshot makes Box2D's two calls (size query, then fill) and returns the
	// image bytes; an empty array when the world is mid-step (Box2D reports size 0).
	ret_function( "b2World_GetSnapshot(worldId): Uint8Array", +[]( b2WorldId worldId ) -> val
	{
		int size = b2World_GetSnapshot( worldId, nullptr, 0 );
		std::vector<uint8_t> image( size > 0 ? (size_t)size : 0 );
		int written = image.empty() ? 0 : b2World_GetSnapshot( worldId, image.data(), (int)image.size() );
		return toU8( image.data(), written );
	} );
	ret_function( "b2World_Restore(worldId, image: ArrayLike<number>): boolean", +[]( b2WorldId worldId, val image )
	{
		std::vector<uint8_t> bytes = bytesOf( image );
		return b2World_Restore( worldId, bytes.data(), (int)bytes.size() );
	} );
	ret_function( "b2CreateWorldFromSnapshot(image: ArrayLike<number>, workerCount): b2WorldId", +[]( val image, int workerCount )
	{
		std::vector<uint8_t> bytes = bytesOf( image );
		b2WorldId worldId = b2CreateWorldFromSnapshot( bytes.data(), (int)bytes.size(), workerCount );
		if ( B2_IS_NON_NULL( worldId ) ) clearCallbacks( worldId.index1 - 1 );
		return worldId;
	} );

	// ---- box2d.h: body ----
	// name on the def (a string, Box2D copies it) is passed through.
	ret_function( "b2CreateBody(worldId, def: b2BodyDef): b2BodyId", +[]( b2WorldId worldId, val def )
	{
		b2BodyDef d = def.as<b2BodyDef>();
		val name = def["name"];
		std::string nameStr = name.isString() ? name.as<std::string>() : std::string();
		d.name = name.isString() ? nameStr.c_str() : nullptr;
		return b2CreateBody( worldId, &d );
	} );
	function( "b2Body_SetName(bodyId, name)", +[]( b2BodyId bodyId, std::string name ) { b2Body_SetName( bodyId, name.c_str() ); } );
	function( "b2Body_GetName(bodyId)", +[]( b2BodyId bodyId ) { const char* n = b2Body_GetName( bodyId ); return std::string( n ? n : "" ); } );
	function( "b2Body_SetUserData(bodyId, userData)", +[]( b2BodyId bodyId, uintptr_t userData ) { b2Body_SetUserData( bodyId, (void*)userData ); } );
	function( "b2Body_GetUserData(bodyId)", +[]( b2BodyId bodyId ) { return (uintptr_t)b2Body_GetUserData( bodyId ); } );

	register_vector<b2ShapeId>( "b2ShapeIdVector" );
	register_vector<b2JointId>( "b2JointIdVector" );
	function( "b2Body_GetShapes(bodyId)", +[]( b2BodyId bodyId )
	{
		std::vector<b2ShapeId> out( (size_t)b2Body_GetShapeCount( bodyId ) );
		if ( !out.empty() ) out.resize( (size_t)b2Body_GetShapes( bodyId, out.data(), (int)out.size() ) );
		return out;
	} );
	function( "b2Body_GetJoints(bodyId)", +[]( b2BodyId bodyId )
	{
		std::vector<b2JointId> out( (size_t)b2Body_GetJointCount( bodyId ) );
		if ( !out.empty() ) out.resize( (size_t)b2Body_GetJoints( bodyId, out.data(), (int)out.size() ) );
		return out;
	} );

	// Live contact data: b2Body_GetContactData / b2Shape_GetContactData fill the reusable,
	// wasm-backed contacts buffer (facade: createContactsBuffer / getBodyContactData /
	// getShapeContactData / getNumContacts / createContact / getContactAt /
	// destroyContactsBuffer). There is no array-returning accessor: building JS objects for
	// every contact each frame is unusably slow, so the zero-alloc buffer is the only path.
	class_<ContactsBuffer>( "ContactsBufferImpl" )
		.constructor<>()
		.function( "loadFromShape", &ContactsBuffer::loadFromShape )
		.function( "loadFromBody", &ContactsBuffer::loadFromBody )
		.function( "count", &ContactsBuffer::getCount )
		.function( "i32Ptr", &ContactsBuffer::i32Ptr )
		.function( "f32Ptr", &ContactsBuffer::f32Ptr );

	// ---- box2d.h: shape ----
	function( "b2Shape_SetUserData(shapeId, userData)", +[]( b2ShapeId shapeId, uintptr_t userData ) { b2Shape_SetUserData( shapeId, (void*)userData ); } );
	function( "b2Shape_GetUserData(shapeId)", +[]( b2ShapeId shapeId ) { return (uintptr_t)b2Shape_GetUserData( shapeId ); } );
	// Sensor overlaps: packed buffer { count, data } of visitor shape ids (3 int32 per id)
	// currently inside this sensor. Read with getShapeIdAt.
	ret_function( "b2Shape_GetSensorData(shapeId): ShapeIdBuffer", +[]( b2ShapeId shapeId ) -> val
	{
		std::vector<b2ShapeId> ids( (size_t)b2Shape_GetSensorCapacity( shapeId ) );
		int n = ids.empty() ? 0 : b2Shape_GetSensorData( shapeId, ids.data(), (int)ids.size() );
		std::vector<int32_t> packed;
		packed.reserve( (size_t)n * layout::shapeId );
		for ( int i = 0; i < n; ++i ) pushShapeId( packed, ids[i] );
		val out = val::object();
		out.set( "count", n );
		out.set( "data", toI32( packed ) );
		return out;
	} );

	// ---- box2d.h: chain ----
	// points is a flat [x0, y0, x1, y1, ...] list, materials an array of b2SurfaceMaterial
	// (one for the whole chain or one per segment); their lengths are pointCount and
	// materialCount. A def without materials uses one default surface material.
	ret_function( "b2CreateChain(bodyId, def: b2ChainDef): b2ChainId", +[]( b2BodyId bodyId, val def )
	{
		b2ChainDef d = def.as<b2ChainDef>();
		std::vector<b2Vec2> pts = def["points"].isUndefined() ? std::vector<b2Vec2>() : toPoints( def["points"] );
		std::vector<b2SurfaceMaterial> mats;
		val m = def["materials"];
		if ( !m.isUndefined() && !m.isNull() )
			for ( int i = 0, n = m["length"].as<int>(); i < n; ++i ) mats.push_back( m[i].as<b2SurfaceMaterial>() );
		if ( mats.empty() ) mats.push_back( b2DefaultSurfaceMaterial() );
		d.points = pts.data();
		d.pointCount = (int)pts.size();
		d.materials = mats.data();
		d.materialCount = (int)mats.size();
		return b2CreateChain( bodyId, &d );
	} );
	function( "b2Chain_GetSegments(chainId)", +[]( b2ChainId chainId )
	{
		std::vector<b2ShapeId> out( (size_t)b2Chain_GetSegmentCount( chainId ) );
		if ( !out.empty() ) out.resize( (size_t)b2Chain_GetSegments( chainId, out.data(), (int)out.size() ) );
		return out;
	} );

	// ---- box2d.h: joint ----
	function( "b2Joint_SetUserData(jointId, userData)", +[]( b2JointId jointId, uintptr_t userData ) { b2Joint_SetUserData( jointId, (void*)userData ); } );
	function( "b2Joint_GetUserData(jointId)", +[]( b2JointId jointId ) { return (uintptr_t)b2Joint_GetUserData( jointId ); } );
	ret_function( "b2Joint_GetConstraintTuning(jointId): { hertz: number, dampingRatio: number }", +[]( b2JointId jointId ) -> val
	{
		float hertz = 0.0f, dampingRatio = 0.0f;
		b2Joint_GetConstraintTuning( jointId, &hertz, &dampingRatio );
		val out = val::object();
		out.set( "hertz", hertz );
		out.set( "dampingRatio", dampingRatio );
		return out;
	} );
	ret_function( "b2DistanceJoint_GetSpringForceRange(jointId): { lowerForce: number, upperForce: number }", +[]( b2JointId jointId ) -> val
	{
		float lowerForce = 0.0f, upperForce = 0.0f;
		b2DistanceJoint_GetSpringForceRange( jointId, &lowerForce, &upperForce );
		val out = val::object();
		out.set( "lowerForce", lowerForce );
		out.set( "upperForce", upperForce );
		return out;
	} );

	// ---- box2d.h: events ----
	// b2World_GetBodyEvents / GetSensorEvents / GetContactEvents / GetJointEvents fill the
	// reusable, wasm-backed events buffer (facade: createEventsBuffer / getEvents /
	// getNum*Events / get*EventAt / destroyEventsBuffer).
	class_<EventsBuffer>( "EventsBufferImpl" )
		.constructor<>()
		.function( "loadFrom", &EventsBuffer::loadFrom )
		.function( "contactBeginCount", &EventsBuffer::getContactBeginCount )
		.function( "contactEndCount", &EventsBuffer::getContactEndCount )
		.function( "contactHitCount", &EventsBuffer::getContactHitCount )
		.function( "bodyMoveCount", &EventsBuffer::getBodyMoveCount )
		.function( "sensorBeginCount", &EventsBuffer::getSensorBeginCount )
		.function( "sensorEndCount", &EventsBuffer::getSensorEndCount )
		.function( "jointCount", &EventsBuffer::getJointCount )
		.function( "contactBeginPtr", &EventsBuffer::contactBeginPtr )
		.function( "contactEndPtr", &EventsBuffer::contactEndPtr )
		.function( "contactHitI32Ptr", &EventsBuffer::contactHitI32Ptr )
		.function( "contactHitF64Ptr", &EventsBuffer::contactHitF64Ptr )
		.function( "bodyMoveI32Ptr", &EventsBuffer::bodyMoveI32Ptr )
		.function( "bodyMoveF64Ptr", &EventsBuffer::bodyMoveF64Ptr )
		.function( "sensorBeginPtr", &EventsBuffer::sensorBeginPtr )
		.function( "sensorEndPtr", &EventsBuffer::sensorEndPtr )
		.function( "jointPtr", &EventsBuffer::jointPtr );

	// ---- box2d.h: replay ----
	ret_function( "b2ValidateReplay(data: ArrayLike<number>, workerCount): boolean", +[]( val data, int workerCount )
	{
		std::vector<uint8_t> bytes = convertJSArrayToNumberVector<uint8_t>( data );
		return b2ValidateReplay( bytes.data(), (int)bytes.size(), workerCount );
	} );
	// Returns a player handle (0 if the recording is malformed). The player copies the bytes.
	ret_function( "b2CreateReplay(data: ArrayLike<number>, workerCount): number", +[]( val data, int workerCount )
	{
		std::vector<uint8_t> bytes = convertJSArrayToNumberVector<uint8_t>( data );
		return reinterpret_cast<uintptr_t>( b2CreateReplay( bytes.data(), (int)bytes.size(), workerCount ) );
	} );
	function( "b2DestroyReplay(player)", +[]( uintptr_t p ) { b2DestroyReplay( asReplay( p ) ); } );
	function( "b2Replay_StepFrame(player)", +[]( uintptr_t p ) { return b2Replay_StepFrame( asReplay( p ) ); } );
	function( "b2Replay_GetWorldId(player)", +[]( uintptr_t p ) { return b2Replay_GetWorldId( asReplay( p ) ); } );
	function( "b2Replay_Restart(player)", +[]( uintptr_t p ) { b2Replay_Restart( asReplay( p ) ); } );
	function( "b2Replay_SeekFrame(player, targetFrame)", +[]( uintptr_t p, int targetFrame ) { b2Replay_SeekFrame( asReplay( p ), targetFrame ); } );
	function( "b2Replay_GetFrame(player)", +[]( uintptr_t p ) { return b2Replay_GetFrame( asReplay( p ) ); } );
	function( "b2Replay_GetInfo(player)", +[]( uintptr_t p ) { return b2Replay_GetInfo( asReplay( p ) ); } );
	function( "b2Replay_IsAtEnd(player)", +[]( uintptr_t p ) { return b2Replay_IsAtEnd( asReplay( p ) ); } );
	function( "b2Replay_HasDiverged(player)", +[]( uintptr_t p ) { return b2Replay_HasDiverged( asReplay( p ) ); } );
	function( "b2Replay_GetDivergeFrame(player)", +[]( uintptr_t p ) { return b2Replay_GetDivergeFrame( asReplay( p ) ); } );
	function( "b2Replay_SetKeyframePolicy(player, budgetBytes, minIntervalFrames)", +[]( uintptr_t p, uintptr_t budgetBytes, int minIntervalFrames )
		{ b2Replay_SetKeyframePolicy( asReplay( p ), (size_t)budgetBytes, minIntervalFrames ); } );
	function( "b2Replay_GetKeyframeBudget(player)", +[]( uintptr_t p ) { return (uintptr_t)b2Replay_GetKeyframeBudget( asReplay( p ) ); } );
	function( "b2Replay_GetKeyframeMinInterval(player)", +[]( uintptr_t p ) { return b2Replay_GetKeyframeMinInterval( asReplay( p ) ); } );
	function( "b2Replay_GetKeyframeInterval(player)", +[]( uintptr_t p ) { return b2Replay_GetKeyframeInterval( asReplay( p ) ); } );
	function( "b2Replay_GetKeyframeBytes(player)", +[]( uintptr_t p ) { return (uintptr_t)b2Replay_GetKeyframeBytes( asReplay( p ) ); } );
	ret_function( "b2Replay_DrawFrameQueries(player, draw: b2DebugDraw, queryIndex): void", +[]( uintptr_t p, val draw, int queryIndex )
	{
		JsDebugDraw jd{ draw };
		b2DebugDraw dd = makeDebugDraw( jd );
		b2Replay_DrawFrameQueries( asReplay( p ), &dd, queryIndex );
	} );
	function( "b2Replay_GetFrameQueryCount(player)", +[]( uintptr_t p ) { return b2Replay_GetFrameQueryCount( asReplay( p ) ); } );
	function( "b2Replay_GetFrameQuery(player, index)", +[]( uintptr_t p, int index ) { return b2Replay_GetFrameQuery( asReplay( p ), index ); } );
	function( "b2Replay_GetFrameQueryHit(player, queryIndex, hitIndex)", +[]( uintptr_t p, int queryIndex, int hitIndex )
		{ return b2Replay_GetFrameQueryHit( asReplay( p ), queryIndex, hitIndex ); } );
	function( "b2Replay_GetBodyCount(player)", +[]( uintptr_t p ) { return b2Replay_GetBodyCount( asReplay( p ) ); } );
	function( "b2Replay_GetBodyId(player, index)", +[]( uintptr_t p, int index ) { return b2Replay_GetBodyId( asReplay( p ), index ); } );
}
