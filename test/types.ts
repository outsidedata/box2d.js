// Type check: `tsc -p test/tsconfig.json` checks this file against dist/box2d.d.ts through the
// package's own export map (box2d.js/inline). It is not run.
import Box2D from 'box2d.js/inline';
import type { b2BodyId, b2Vec2, b2Rot, Contact, Box2DModule } from 'box2d.js/inline';

const b2: Box2DModule = await Box2D();
const worldDef = b2.b2DefaultWorldDef();
worldDef.gravity = [ 0, -10 ];
worldDef.frictionCallback = ( fa, _ma: bigint, fb ) => Math.max( fa, fb );
const worldId = b2.b2CreateWorld( worldDef );
const bodyDef = b2.b2DefaultBodyDef();
bodyDef.type = b2.b2BodyType.b2_dynamicBody;
bodyDef.position = [ 0, 4 ];
bodyDef.name = 'box';
const bodyId: b2BodyId = b2.b2CreateBody( worldId, bodyDef );
const shapeDef = b2.b2DefaultShapeDef();
shapeDef.filter.maskBits = b2.B2_DEFAULT_MASK_BITS;
b2.b2CreatePolygonShape( bodyId, shapeDef, b2.b2MakeBox( 0.5, 0.5 ) );
b2.b2World_Step( worldId, 1 / 60, 4 );
const p: b2Vec2 = b2.b2Body_GetPosition( [ 0, 0 ], bodyId );
const [ tp, tq ]: [ b2Vec2, b2Rot ] = b2.b2Body_GetTransform( [ 0, 0 ], [ 1, 0 ], bodyId );
const hit = b2.b2World_CastRayClosest( worldId, [ 0, 10 ], [ 0, -20 ], b2.b2DefaultQueryFilter() );
b2.b2World_CastRay( worldId, [ 0, 10 ], [ 0, -20 ], b2.b2DefaultQueryFilter(), ( shapeId, point, normal, fraction ) => fraction );
const image: Uint8Array = b2.b2World_GetSnapshot( worldId );
const ok: boolean = b2.b2World_Restore( worldId, image );
const stateHash: bigint = b2.b2World_GetStateHash( worldId );
const cb = b2.createContactsBuffer();
const contact: Contact = b2.createContact();
b2.getBodyContactData( cb, bodyId );
for ( let i = 0; i < b2.getNumContacts( cb ); i++ ) b2.getContactAt( contact, cb, i ).manifold.points[ 0 ].separation;
b2.destroyContactsBuffer( cb );
const verts: ArrayLike<number> = b2.b2MakeBox( 1, 1 ).vertices;
const slop: number = b2.B2_LINEAR_SLOP;
console.log( p, tp, tq, hit.hit, ok, stateHash, verts.length, slop );
b2.b2DestroyWorld( worldId );

// @ts-expect-error — a b2Vec2 is two numbers
b2.b2Body_SetLinearVelocity( bodyId, [ 1, 2, 3 ] );
