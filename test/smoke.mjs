// Smoke test: base API, real simulations, every joint type, a chain, queries, buffers,
// snapshot/restore, recording/replay, and Box2D's own cross-platform determinism scene,
// run against every build variant.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPECTED_HASH, EXPECTED_SLEEP_STEP, createFallingHinges, formatHash, hashTransforms, runDeterminism } from './determinism.mjs';

function groundBox( b2, worldId, halfWidth = 40, halfHeight = 1, y = -1 )
{
	const bodyDef = b2.b2DefaultBodyDef();
	bodyDef.position = [ 0, y ];
	const groundId = b2.b2CreateBody( worldId, bodyDef );
	b2.b2CreatePolygonShape( groundId, b2.b2DefaultShapeDef(), b2.b2MakeBox( halfWidth, halfHeight ) );
	return groundId;
}

function dynamicBody( b2, worldId, position, extra = {} )
{
	const def = b2.b2DefaultBodyDef();
	def.type = b2.b2BodyType.b2_dynamicBody;
	def.position = position;
	Object.assign( def, extra );
	return b2.b2CreateBody( worldId, def );
}

function fallingBody( b2 )
{
	const worldDef = b2.b2DefaultWorldDef();
	worldDef.gravity = [ 0, -10 ];
	const worldId = b2.b2CreateWorld( worldDef );
	assert.ok( b2.b2World_IsValid( worldId ), 'world is valid' );
	groundBox( b2, worldId, 25, 0.5, 0 );

	const bodyId = dynamicBody( b2, worldId, [ 0, 10 ] );
	b2.b2CreateCircleShape( bodyId, b2.b2DefaultShapeDef(), { center: [ 0, 0 ], radius: 0.5 } );

	const pos = [ 0, 0 ];
	const startY = b2.b2Body_GetPosition( pos, bodyId )[ 1 ];
	for ( let i = 0; i < 150; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	const endY = b2.b2Body_GetPosition( pos, bodyId )[ 1 ];

	// multi-out reader: a transform reads as two out params and returns them as a tuple
	const tp = [ 0, 0 ], tq = [ 1, 0 ];
	const [ tPos, tRot ] = b2.b2Body_GetTransform( tp, tq, bodyId );
	assert.ok( tPos === tp && tRot === tq, 'GetTransform fills the caller arrays and returns them' );
	assert.equal( tPos[ 1 ], endY, 'transform position matches GetPosition' );
	assert.ok( Math.abs( Math.hypot( tRot[ 0 ], tRot[ 1 ] ) - 1 ) < 1e-5, 'transform rotation is a unit rotation' );

	assert.ok( endY < startY - 5, `body fell (start=${startY.toFixed( 2 )} end=${endY.toFixed( 2 )})` );
	assert.ok( endY > 0.9 && endY < 1.1, `body rests on the ground (end=${endY.toFixed( 3 )})` );
	b2.b2DestroyWorld( worldId );
	return { startY, endY };
}

// Drop a box on the ground, read a body move event from the events buffer while it falls,
// then the resting contact through the contacts buffer.
function contactsAndEvents( b2 )
{
	const worldDef = b2.b2DefaultWorldDef();
	const worldId = b2.b2CreateWorld( worldDef );
	const groundId = groundBox( b2, worldId );

	const boxId = dynamicBody( b2, worldId, [ 0, 4 ], { userData: 77 } );
	const shapeDef = b2.b2DefaultShapeDef();
	shapeDef.enableContactEvents = true;
	shapeDef.enableHitEvents = true;
	const boxShape = b2.b2CreatePolygonShape( boxId, shapeDef, b2.b2MakeBox( 0.5, 0.5 ) );

	const eb = b2.createEventsBuffer();
	const move = b2.createBodyMoveEvent();
	const begin = b2.createContactTouchEvent();
	const hit = b2.createContactHitEvent();
	b2.b2World_Step( worldId, 1 / 60, 4 );
	b2.getEvents( eb, worldId );
	assert.equal( b2.getNumBodyMoveEvents( eb ), 1, 'one body move event while falling' );
	b2.getBodyMoveEventAt( move, eb, 0 );
	assert.equal( move.bodyId.index1, boxId.index1, 'move event body id' );
	assert.equal( move.userData, 77, 'move event carries the body user data' );
	assert.ok( move.transform.p[ 1 ] < 4, 'move event position fell' );

	let sawBegin = false, sawHit = false;
	for ( let i = 0; i < 120; i++ )
	{
		b2.b2World_Step( worldId, 1 / 60, 4 );
		b2.getEvents( eb, worldId );
		for ( let k = 0, n = b2.getNumContactBeginEvents( eb ); k < n; k++ )
		{
			b2.getContactBeginEventAt( begin, eb, k );
			if ( begin.shapeIdA.index1 === boxShape.index1 || begin.shapeIdB.index1 === boxShape.index1 ) sawBegin = true;
		}
		for ( let k = 0, n = b2.getNumContactHitEvents( eb ); k < n; k++ )
		{
			b2.getContactHitEventAt( hit, eb, k );
			assert.ok( hit.approachSpeed > 0 && Math.abs( Math.hypot( hit.normal[ 0 ], hit.normal[ 1 ] ) - 1 ) < 1e-4, 'hit event decodes' );
			sawHit = true;
		}
	}
	assert.ok( sawBegin, 'contact begin event decoded via the events buffer' );
	assert.ok( sawHit, 'contact hit event decoded via the events buffer' );

	const cb = b2.createContactsBuffer();
	const contact = b2.createContact();
	b2.getBodyContactData( cb, boxId );
	assert.equal( b2.getNumContacts( cb ), 1, 'resting box has one contact' );
	b2.getContactAt( contact, cb, 0 );
	assert.ok( b2.b2Contact_IsValid( contact.contactId ), 'contact id from the buffer is valid' );
	assert.equal( contact.manifold.pointCount, 2, 'box on ground has a two-point manifold' );
	const nrm = contact.manifold.normal;
	assert.ok( Math.abs( Math.hypot( nrm[ 0 ], nrm[ 1 ] ) - 1 ) < 1e-5, 'manifold normal is unit length' );
	const pushed = contact.manifold.points[ 0 ].normalImpulse + contact.manifold.points[ 1 ].normalImpulse;
	assert.ok( pushed > 0, 'resting contact carries normal impulse' );
	// same contact through b2Contact_GetData (value object) and the shape-side buffer
	const data = b2.b2Contact_GetData( contact.contactId );
	assert.equal( data.manifold.pointCount, 2, 'b2Contact_GetData manifold' );
	assert.equal( data.manifold.points[ 0 ].normalImpulse, contact.manifold.points[ 0 ].normalImpulse, 'buffer and b2Contact_GetData agree' );
	b2.getShapeContactData( cb, boxShape );
	assert.equal( b2.getNumContacts( cb ), 1, 'shape contact data' );
	b2.b2World_Step( worldId, 1 / 60, 4 );
	b2.getBodyContactData( cb, groundId );
	assert.equal( b2.getNumContacts( cb ), 1, 'buffer refills after a step' );

	b2.destroyContactsBuffer( cb );
	b2.destroyEventsBuffer( eb );
	b2.b2DestroyWorld( worldId );
}

// Sensor events, the sensor overlap buffer, and CollideMover planes.
function sensorsAndMover( b2 )
{
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	const sensorBody = b2.b2CreateBody( worldId, b2.b2DefaultBodyDef() );
	const sensorDef = b2.b2DefaultShapeDef();
	sensorDef.isSensor = true;
	sensorDef.enableSensorEvents = true;
	const sensorShape = b2.b2CreatePolygonShape( sensorBody, sensorDef, b2.b2MakeBox( 2, 2 ) );

	const visitor = dynamicBody( b2, worldId, [ 0, 0 ], { gravityScale: 0 } );
	const visitorDef = b2.b2DefaultShapeDef();
	visitorDef.enableSensorEvents = true;
	const visitorShape = b2.b2CreateCircleShape( visitor, visitorDef, { center: [ 0, 0 ], radius: 0.5 } );

	const eb = b2.createEventsBuffer();
	const touch = b2.createSensorTouchEvent();
	let sawSensor = false;
	for ( let i = 0; i < 4 && !sawSensor; i++ )
	{
		b2.b2World_Step( worldId, 1 / 60, 4 );
		b2.getEvents( eb, worldId );
		for ( let k = 0, n = b2.getNumSensorBeginEvents( eb ); k < n; k++ )
		{
			b2.getSensorBeginEventAt( touch, eb, k );
			if ( touch.visitorShapeId.index1 === visitorShape.index1 && touch.sensorShapeId.index1 === sensorShape.index1 ) sawSensor = true;
		}
	}
	b2.destroyEventsBuffer( eb );
	assert.ok( sawSensor, 'sensor begin-touch event decoded via the events buffer' );
	const overlaps = b2.b2Shape_GetSensorData( sensorShape );
	const sid = b2.createShapeId();
	assert.equal( b2.getNumShapeIds( overlaps ), 1, 'sensor overlap buffer' );
	assert.equal( b2.getShapeIdAt( sid, overlaps, 0 ).index1, visitorShape.index1, 'sensor overlap id' );

	const obstacleDef = b2.b2DefaultBodyDef();
	obstacleDef.position = [ 10, 1 ];
	const obstacle = b2.b2CreateBody( worldId, obstacleDef );
	b2.b2CreateCircleShape( obstacle, b2.b2DefaultShapeDef(), { center: [ 0, 0 ], radius: 0.6 } );
	b2.b2World_Step( worldId, 1 / 60, 4 );
	const mover = { center1: [ 0, -0.5 ], center2: [ 0, 0.5 ], radius: 0.35 };
	const planeResult = b2.createPlaneResult();
	const planes = [];
	b2.b2World_CollideMover( worldId, [ 10.5, 1 ], mover, b2.b2DefaultQueryFilter(), ( _shapeId, buf ) =>
	{
		for ( let i = 0, n = b2.getNumPlaneResults( buf ); i < n; i++ )
		{
			b2.getPlaneResultAt( planeResult, buf, i );
			if ( planeResult.hit ) planes.push( { plane: { normal: [ ...planeResult.plane.normal ], offset: planeResult.plane.offset }, pushLimit: 3.4e38, push: 0, clipVelocity: true } );
		}
		return true;
	} );
	assert.ok( planes.length >= 1, `CollideMover reported plane results via the buffer (got ${planes.length})` );
	assert.ok( Math.abs( Math.hypot( ...planes[ 0 ].plane.normal ) - 1 ) < 1e-4, 'plane normal is unit length' );
	const solved = b2.b2SolvePlanes( [ 0, 0 ], planes );
	assert.ok( solved.iterationCount >= 1 && planes[ 0 ].push > 0, 'b2SolvePlanes solves and writes each plane push' );
	const clipped = b2.b2ClipVector( [ -1, 0 ], planes );
	assert.ok( clipped[ 0 ] > -1, 'b2ClipVector clips against the plane' );
	const moverFraction = b2.b2World_CastMover( worldId, [ 8, 1 ], mover, [ 4, 0 ], b2.b2DefaultQueryFilter() );
	assert.ok( moverFraction > 0 && moverFraction < 1, `b2World_CastMover stops at the obstacle (${moverFraction})` );

	b2.b2DestroyWorld( worldId );
	return { planeCount: planes.length };
}

function queries( b2 )
{
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	groundBox( b2, worldId );
	const boxBody = b2.b2CreateBody( worldId, Object.assign( b2.b2DefaultBodyDef(), { position: [ 5, 3 ] } ) );
	const boxShape = b2.b2CreatePolygonShape( boxBody, b2.b2DefaultShapeDef(), b2.b2MakeBox( 1, 1 ) );

	const closest = b2.b2World_CastRayClosest( worldId, [ 5, 10 ], [ 0, -20 ], b2.b2DefaultQueryFilter() );
	assert.ok( closest.hit, 'ray hit' );
	assert.equal( closest.shapeId.index1, boxShape.index1, 'ray hits the box first' );
	assert.ok( Math.abs( closest.point[ 1 ] - 4 ) < 1e-5 && Math.abs( closest.normal[ 1 ] - 1 ) < 1e-5, 'ray point and normal' );

	const hits = [];
	b2.b2World_CastRay( worldId, [ 5, 10 ], [ 0, -20 ], b2.b2DefaultQueryFilter(), ( shapeId, point, normal, fraction ) =>
	{
		hits.push( { shapeId, point, normal, fraction } );
		return 1; // keep going: collect every shape on the ray
	} );
	assert.equal( hits.length, 2, 'b2World_CastRay callback sees the box and the ground' );

	const overlapped = [];
	b2.b2World_OverlapAABB( worldId, b2.b2Pos_zero, [ 4, 2, 6, 5 ], b2.b2DefaultQueryFilter(), ( shapeId ) => { overlapped.push( shapeId ); return true; } );
	assert.equal( overlapped.length, 1, 'b2World_OverlapAABB' );
	const proxy = b2.b2MakeProxy( [ 5, 3 ], 0.25 );
	let shapeOverlap = 0;
	b2.b2World_OverlapShape( worldId, b2.b2Pos_zero, proxy, b2.b2DefaultQueryFilter(), () => { shapeOverlap++; return true; } );
	assert.equal( shapeOverlap, 1, 'b2World_OverlapShape with a b2ShapeProxy' );
	let castHit = null;
	b2.b2World_CastShape( worldId, b2.b2Pos_zero, b2.b2MakeProxy( [ 0, 3 ], 0.5 ), [ 10, 0 ], b2.b2DefaultQueryFilter(), ( shapeId, point, normal, fraction ) =>
	{
		castHit = { shapeId, fraction };
		return fraction;
	} );
	assert.ok( castHit && castHit.shapeId.index1 === boxShape.index1 && Math.abs( castHit.fraction - 0.35 ) < 1e-3, 'b2World_CastShape' );
	const shapeRay = b2.b2Shape_RayCast( boxShape, [ 0, 3 ], [ 10, 0 ] );
	assert.ok( shapeRay.hit && Math.abs( shapeRay.point[ 0 ] - 4 ) < 1e-5, 'b2Shape_RayCast' );
	assert.ok( b2.b2Shape_TestPoint( boxShape, [ 5.5, 3.5 ] ), 'b2Shape_TestPoint' );
	b2.b2DestroyWorld( worldId );
}

// Every joint type Box2D has, created, stepped, and read back through its own getters.
function allJoints( b2 )
{
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	const groundId = groundBox( b2, worldId );
	const bodies = [];
	const makePair = ( x ) =>
	{
		const a = dynamicBody( b2, worldId, [ x, 4 ] );
		const b = dynamicBody( b2, worldId, [ x + 1, 4 ] );
		b2.b2CreatePolygonShape( a, b2.b2DefaultShapeDef(), b2.b2MakeBox( 0.25, 0.25 ) );
		b2.b2CreateCircleShape( b, b2.b2DefaultShapeDef(), { center: [ 0, 0 ], radius: 0.25 } );
		bodies.push( a, b );
		return [ a, b ];
	};
	const joints = {};
	{
		const [ a, b ] = makePair( -20 );
		const d = b2.b2DefaultDistanceJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b; d.length = 1; d.enableSpring = true; d.hertz = 2; d.dampingRatio = 0.5;
		joints.distance = b2.b2CreateDistanceJoint( worldId, d );
	}
	{
		const [ a, b ] = makePair( -15 );
		const d = b2.b2DefaultFilterJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b;
		joints.filter = b2.b2CreateFilterJoint( worldId, d );
	}
	{
		const [ , b ] = makePair( -10 );
		const d = b2.b2DefaultMotorJointDef();
		d.base.bodyIdA = groundId; d.base.bodyIdB = b; d.linearVelocity = [ 1, 0 ]; d.maxVelocityForce = 100; d.maxVelocityTorque = 10;
		joints.motor = b2.b2CreateMotorJoint( worldId, d );
	}
	{
		const [ , b ] = makePair( -5 );
		const d = b2.b2DefaultMoverJointDef();
		d.base.bodyIdA = groundId; d.base.bodyIdB = b; d.linearVelocity = [ 0.5, 0 ]; d.maxVelocityForce = [ 50, 0 ];
		joints.mover = b2.b2CreateMoverJoint( worldId, d );
	}
	{
		const [ , b ] = makePair( 0 );
		const d = b2.b2DefaultPogoJointDef();
		d.base.bodyIdA = groundId; d.base.bodyIdB = b; d.normal = [ 0, 1 ]; d.restLength = 1; d.hertz = 5; d.dampingRatio = 0.7;
		d.maxCompressionForce = 1000; d.maxTensionForce = 1000;
		joints.pogo = b2.b2CreatePogoJoint( worldId, d );
	}
	{
		const [ a, b ] = makePair( 5 );
		const d = b2.b2DefaultPrismaticJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b; d.base.localFrameB.p = [ -1, 0 ]; d.enableLimit = true; d.lowerTranslation = -0.5; d.upperTranslation = 0.5;
		d.enableMotor = true; d.maxMotorForce = 10; d.motorSpeed = 1;
		joints.prismatic = b2.b2CreatePrismaticJoint( worldId, d );
	}
	{
		const [ a, b ] = makePair( 10 );
		const d = b2.b2DefaultRevoluteJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b; d.base.localFrameA.p = [ 0.5, 0 ]; d.base.localFrameB.p = [ -0.5, 0 ];
		d.enableMotor = true; d.maxMotorTorque = 5; d.motorSpeed = 2;
		joints.revolute = b2.b2CreateRevoluteJoint( worldId, d );
	}
	{
		const [ a, b ] = makePair( 15 );
		const d = b2.b2DefaultWeldJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b; d.base.localFrameA.p = [ 0.5, 0 ]; d.base.localFrameB.p = [ -0.5, 0 ];
		joints.weld = b2.b2CreateWeldJoint( worldId, d );
	}
	{
		const [ a, b ] = makePair( 20 );
		const d = b2.b2DefaultWheelJointDef();
		d.base.bodyIdA = a; d.base.bodyIdB = b; d.base.localFrameA.q = b2.b2MakeRot( 0.5 * b2.B2_PI ); d.base.localFrameB.q = b2.b2MakeRot( 0.5 * b2.B2_PI );
		d.enableSpring = true; d.hertz = 4; d.enableMotor = true; d.maxMotorTorque = 5; d.motorSpeed = 3;
		joints.wheel = b2.b2CreateWheelJoint( worldId, d );
	}

	const T = b2.b2JointType;
	const expected = {
		distance: T.b2_distanceJoint, filter: T.b2_filterJoint, motor: T.b2_motorJoint, mover: T.b2_moverJoint, pogo: T.b2_pogoJoint,
		prismatic: T.b2_prismaticJoint, revolute: T.b2_revoluteJoint, weld: T.b2_weldJoint, wheel: T.b2_wheelJoint,
	};
	assert.equal( Object.keys( joints ).length, Object.keys( T ).filter( ( k ) => k.startsWith( 'b2_' ) ).length, 'one joint per b2JointType' );
	for ( const [ name, id ] of Object.entries( joints ) )
	{
		assert.ok( b2.b2Joint_IsValid( id ), `${name} joint is valid` );
		assert.equal( b2.b2Joint_GetType( id ), expected[ name ], `${name} joint type` );
	}
	for ( let i = 0; i < 90; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );

	const force = [ 0, 0 ];
	for ( const [ name, id ] of Object.entries( joints ) )
	{
		b2.b2Joint_GetConstraintForce( force, id );
		assert.ok( Number.isFinite( force[ 0 ] ) && Number.isFinite( force[ 1 ] ), `${name} constraint force` );
	}
	assert.ok( Math.abs( b2.b2DistanceJoint_GetCurrentLength( joints.distance ) - 1 ) < 0.5, 'distance joint holds its length' );
	assert.ok( b2.b2RevoluteJoint_GetMotorTorque( joints.revolute ) !== 0, 'revolute motor works' );
	assert.ok( b2.b2PrismaticJoint_GetTranslation( joints.prismatic ) <= 0.5 + 0.01, 'prismatic limit holds' );
	assert.ok( b2.b2WheelJoint_GetMotorTorque( joints.wheel ) !== 0, 'wheel motor works' );
	const v = b2.b2MotorJoint_GetLinearVelocity( [ 0, 0 ], joints.motor );
	assert.deepEqual( v, [ 1, 0 ], 'motor joint linear velocity out-param reader' );
	assert.deepEqual( b2.b2MoverJoint_GetMaxVelocityForce( [ 0, 0 ], joints.mover ), [ 50, 0 ], 'mover joint out-param reader' );
	assert.ok( b2.b2PogoJoint_GetLength( joints.pogo ) > 0, 'pogo joint length' );
	assert.equal( b2.b2WeldJoint_GetLinearHertz( joints.weld ), 0, 'weld joint getter' );
	const range = b2.b2DistanceJoint_GetSpringForceRange( joints.distance );
	assert.ok( range.lowerForce < 0 && range.upperForce > 0, 'distance joint spring force range' );
	const tuning = b2.b2Joint_GetConstraintTuning( joints.revolute );
	assert.ok( tuning.hertz > 0, 'joint constraint tuning' );
	const [ fp, fq ] = b2.b2Joint_GetLocalFrameA( [ 0, 0 ], [ 1, 0 ], joints.revolute );
	assert.deepEqual( [ fp, fq ], [ [ 0.5, 0 ], [ 1, 0 ] ], 'joint local frame out-param reader' );
	const jointsOnBody = b2.b2Body_GetJoints( bodies[ 0 ] );
	assert.equal( jointsOnBody.size(), 1, 'b2Body_GetJoints vector' );
	jointsOnBody.delete();
	b2.b2DestroyJoint( joints.weld );
	assert.ok( !b2.b2Joint_IsValid( joints.weld ), 'b2DestroyJoint' );
	b2.b2DestroyWorld( worldId );
	return Object.keys( joints ).length;
}

// A chain loop holds a dropped circle; per-segment materials and the segment list work.
function chainShape( b2 )
{
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	const groundId = b2.b2CreateBody( worldId, b2.b2DefaultBodyDef() );
	const def = b2.b2DefaultChainDef();
	// Chain segments collide on their right side, so a clockwise loop faces inward: a box.
	def.points = [ -10, 0, -10, 10, 10, 10, 10, 0 ];
	def.isLoop = true;
	const material = b2.b2DefaultSurfaceMaterial();
	material.friction = 0.4;
	def.materials = [ material ];
	const chainId = b2.b2CreateChain( groundId, def );
	assert.ok( b2.b2Chain_IsValid( chainId ), 'chain is valid' );
	assert.equal( b2.b2Chain_GetSegmentCount( chainId ), 4, 'loop of 4 points has 4 segments' );
	const segments = b2.b2Chain_GetSegments( chainId );
	assert.equal( segments.size(), 4, 'b2Chain_GetSegments vector' );
	const seg0 = segments.get( 0 );
	segments.delete();
	assert.equal( b2.b2Shape_GetType( seg0 ), b2.b2ShapeType.b2_chainSegmentShape, 'segment type' );
	assert.equal( b2.b2Shape_GetParentChain( seg0 ).index1, chainId.index1, 'segment parent chain' );
	assert.ok( Math.abs( b2.b2Chain_GetSurfaceMaterial( chainId, 2 ).friction - 0.4 ) < 1e-6, 'chain material' );

	const ball = dynamicBody( b2, worldId, [ 0, 5 ] );
	b2.b2CreateCircleShape( ball, b2.b2DefaultShapeDef(), { center: [ 0, 0 ], radius: 0.5 } );
	for ( let i = 0; i < 200; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	const p = b2.b2Body_GetPosition( [ 0, 0 ], ball );
	assert.ok( p[ 1 ] > 0.4 && p[ 1 ] < 0.6, `ball rests on the chain (y=${p[ 1 ].toFixed( 3 )})` );
	b2.b2DestroyChain( chainId );
	assert.ok( !b2.b2Chain_IsValid( chainId ), 'b2DestroyChain' );
	b2.b2DestroyWorld( worldId );
}

// Callbacks, user data, names, filters, geometry, standalone collision, tree, debug draw.
function surface( b2 )
{
	const worldDef = b2.b2DefaultWorldDef();
	let frictionCalls = 0;
	worldDef.frictionCallback = ( fa, ma, fb, mb ) => { frictionCalls++; assert.equal( typeof ma, 'bigint' ); return Math.max( fa, fb ); };
	worldDef.userData = 1234;
	const worldId = b2.b2CreateWorld( worldDef );
	assert.equal( b2.b2World_GetUserData( worldId ), 1234, 'world user data' );
	groundBox( b2, worldId );
	const bodyId = dynamicBody( b2, worldId, [ 0, 1 ], { name: 'crate', userData: 5 } );
	assert.equal( b2.b2Body_GetName( bodyId ), 'crate', 'body name from the def' );
	assert.equal( b2.b2Body_GetUserData( bodyId ), 5, 'body user data from the def' );
	b2.b2Body_SetUserData( bodyId, 6 );
	assert.equal( b2.b2Body_GetUserData( bodyId ), 6, 'b2Body_SetUserData' );
	const shapeDef = b2.b2DefaultShapeDef();
	shapeDef.filter.categoryBits = 0x8000000000000000n;
	shapeDef.enablePreSolveEvents = true;
	shapeDef.material.userMaterialId = 9n;
	const shapeId = b2.b2CreatePolygonShape( bodyId, shapeDef, b2.b2MakeRoundedBox( 0.4, 0.4, 0.1 ) );
	assert.equal( b2.b2Shape_GetFilter( shapeId ).categoryBits, 0x8000000000000000n, 'uint64 filter bits round-trip as bigint' );
	assert.equal( b2.b2Shape_GetFilter( shapeId ).maskBits, b2.B2_DEFAULT_MASK_BITS, 'default mask bits' );
	assert.equal( b2.B2_DEFAULT_MASK_BITS, 0xFFFFFFFFFFFFFFFFn, 'B2_DEFAULT_MASK_BITS is UINT64_MAX' );
	assert.equal( b2.b2Shape_GetUserMaterial( shapeId ), 9n, 'user material id' );
	let preSolveCalls = 0;
	b2.b2World_SetPreSolveCallback( worldId, ( a, b, manifold ) =>
	{
		preSolveCalls++;
		assert.ok( manifold.pointCount >= 0 && Array.isArray( manifold.points ) );
	}, null );
	let filterCalls = 0;
	b2.b2World_SetCustomFilterCallback( worldId, () => { filterCalls++; return true; } );
	for ( let i = 0; i < 30; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	assert.ok( frictionCalls > 0, 'friction callback from the world def runs' );
	assert.ok( preSolveCalls > 0, 'pre-solve callback runs' );
	b2.b2World_SetPreSolveCallback( worldId, null, null );

	// debug draw through a b2DebugDraw object
	const draw = b2.b2DefaultDebugDraw();
	draw.drawShapes = true;
	draw.drawingBounds = [ -100, -100, 100, 100 ];
	let polys = 0;
	draw.DrawSolidPolygonFcn = ( xf, vertices, count ) => { polys++; assert.equal( vertices.length, 2 * count ); };
	b2.b2World_Draw( worldId, draw );
	assert.equal( polys, 2, 'debug draw draws both polygons' );

	// counters, profile, shapes
	const counters = b2.b2World_GetCounters( worldId );
	assert.equal( counters.bodyCount, 2, 'counters' );
	assert.equal( typeof counters.byteCount, 'bigint', 'counters byteCount is int64' );
	assert.equal( counters.colorCounts.length, 24, 'counters color counts' );
	assert.ok( typeof b2.b2World_GetProfile( worldId ).step === 'number', 'profile' );
	const shapes = b2.b2Body_GetShapes( bodyId );
	assert.equal( shapes.size(), 1, 'b2Body_GetShapes' );
	shapes.delete();
	const polygon = b2.b2Shape_GetPolygon( shapeId );
	assert.equal( polygon.count, 4, 'polygon round-trip' );
	assert.equal( polygon.vertices.length, 8, 'polygon vertices as a flat list' );
	b2.b2Shape_SetPolygon( shapeId, polygon );
	assert.deepEqual( [ ...b2.b2Shape_GetPolygon( shapeId ).vertices ], [ ...polygon.vertices ], 'polygon survives a set/get round trip' );
	b2.b2DestroyWorld( worldId );

	// geometry + standalone collision
	const hull = b2.b2ComputeHull( [ 0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.5 ] );
	assert.equal( hull.count, 4, 'hull drops the interior point' );
	assert.ok( b2.b2ValidateHull( hull ), 'hull validates' );
	const poly = b2.b2MakePolygon( hull, 0 );
	const mass = b2.b2ComputePolygonMass( poly, 2 );
	assert.ok( Math.abs( mass.mass - 2 ) < 1e-5 && Math.abs( mass.center[ 0 ] - 0.5 ) < 1e-5, 'polygon mass' );
	const circle = { center: [ 0, 0 ], radius: 1 };
	const manifold = b2.b2CollideCircles( circle, circle, { p: [ 1.5, 0 ], q: [ 1, 0 ] } );
	assert.equal( manifold.pointCount, 1, 'b2CollideCircles' );
	assert.ok( Math.abs( manifold.points[ 0 ].separation + 0.5 ) < 1e-5, 'circle overlap separation' );
	const cache = { ...b2.b2_emptySimplexCache };
	const dist = b2.b2ShapeDistance( {
		proxyA: b2.b2MakeProxy( [ 0, 0 ], 0 ), proxyB: b2.b2MakeProxy( [ 0, 0, 1, 0 ], 0 ),
		transform: { p: [ 0, 3 ], q: [ 1, 0 ] }, useRadii: false,
	}, cache, null, 0 );
	assert.ok( Math.abs( dist.distance - 3 ) < 1e-5, 'b2ShapeDistance' );
	assert.ok( cache.count > 0, 'b2ShapeDistance writes the simplex cache back' );
	const rayOut = b2.b2RayCastCircle( circle, { origin: [ -5, 0 ], translation: [ 10, 0 ], maxFraction: 1 } );
	assert.ok( rayOut.hit && Math.abs( rayOut.fraction - 0.4 ) < 1e-5, 'b2RayCastCircle' );
	const toi = b2.b2TimeOfImpact( {
		proxyA: b2.b2MakeProxy( [ 0, 0 ], 0.5 ), proxyB: b2.b2MakeProxy( [ 0, 0 ], 0.5 ),
		sweepA: { localCenter: [ 0, 0 ], c1: [ 0, 0 ], c2: [ 0, 0 ], q1: [ 1, 0 ], q2: [ 1, 0 ] },
		sweepB: { localCenter: [ 0, 0 ], c1: [ 4, 0 ], c2: [ -4, 0 ], q1: [ 1, 0 ], q2: [ 1, 0 ] },
		maxFraction: 1,
	} );
	assert.equal( toi.state, b2.b2TOIState.b2_toiStateHit, 'b2TimeOfImpact hits' );
	assert.deepEqual( b2.b2ComputeCosSin( 0 ), { cosine: 1, sine: 0 }, 'b2ComputeCosSin' );
	assert.deepEqual( b2.b2Add( [ 1, 2 ], [ 3, 4 ] ), [ 4, 6 ], 'math functions are bound' );
	assert.equal( b2.b2StoreBodyId( b2.b2LoadBodyId( 0x0000000500020003n ) ), 0x0000000500020003n, 'id store/load as bigint' );

	// dynamic tree
	const tree = b2.b2CreateDynamicTree( 16 );
	const proxyId = b2.b2CreateTreeProxy( tree, [ 0, 0, 1, 1 ], 1n, 42n );
	const found = [];
	b2.b2DynamicTree_Query( tree, [ 0.5, 0.5, 2, 2 ], b2.B2_DEFAULT_MASK_BITS, ( id, userData ) => { found.push( [ id, userData ] ); return true; } );
	assert.deepEqual( found, [ [ proxyId, 42n ] ], 'dynamic tree query' );
	b2.b2DestroyDynamicTree( tree );

	// constants
	assert.ok( Math.abs( b2.B2_LINEAR_SLOP - 0.005 ) < 1e-9, 'length-scaled constant' );
	assert.equal( b2.B2_MAX_POLYGON_VERTICES, 8, 'fixed constant' );
	assert.deepEqual( b2.b2Rot_identity, [ 1, 0 ], 'b2Rot_identity' );
}

// Snapshot at step k, run to m, restore, run to m again: the state hash at m repeats.
// Also: b2CreateWorldFromSnapshot rebuilds the same state in a new world, and a recording
// of the run replays without divergence.
function snapshotRestore( b2 )
{
	const k = 60, m = 150;
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	const recording = b2.b2CreateRecording( 0 );
	b2.b2World_StartRecording( worldId, recording );
	const data = createFallingHinges( b2, worldId );
	for ( let i = 0; i < k; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	const image = b2.b2World_GetSnapshot( worldId );
	assert.ok( image instanceof Uint8Array && image.length > 0, 'b2World_GetSnapshot returns the image bytes' );
	const hashAtK = b2.b2World_GetStateHash( worldId );
	for ( let i = k; i < m; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	const first = b2.b2World_GetStateHash( worldId );
	const firstTransforms = hashTransforms( b2, data.bodyIds );
	b2.b2World_StopRecording( worldId );
	assert.notEqual( first, hashAtK, 'state moved between k and m' );

	assert.ok( b2.b2World_Restore( worldId, image ), 'b2World_Restore succeeds' );
	assert.equal( b2.b2World_GetStateHash( worldId ), hashAtK, 'restored state hash equals the hash at the snapshot' );
	for ( let i = k; i < m; i++ ) b2.b2World_Step( worldId, 1 / 60, 4 );
	const second = b2.b2World_GetStateHash( worldId );
	assert.equal( second, first, `state hash at step ${m} repeats after restore` );
	assert.equal( hashTransforms( b2, data.bodyIds ), firstTransforms, 'held body ids still read the same transforms after restore' );

	const copyId = b2.b2CreateWorldFromSnapshot( image, 0 );
	assert.ok( b2.b2World_IsValid( copyId ), 'b2CreateWorldFromSnapshot' );
	assert.equal( b2.b2World_GetStateHash( copyId ), hashAtK, 'world from snapshot has the snapshot state' );
	for ( let i = k; i < m; i++ ) b2.b2World_Step( copyId, 1 / 60, 4 );
	assert.equal( b2.b2World_GetStateHash( copyId ), first, 'world from snapshot simulates identically' );
	b2.b2DestroyWorld( copyId );

	const bytes = b2.b2Recording_GetData( recording );
	assert.equal( bytes.length, b2.b2Recording_GetSize( recording ), 'recording bytes' );
	assert.ok( b2.b2ValidateReplay( bytes, 0 ), 'recording replays without divergence' );
	const player = b2.b2CreateReplay( bytes, 0 );
	assert.ok( player !== 0, 'b2CreateReplay' );
	const info = b2.b2Replay_GetInfo( player );
	assert.equal( info.frameCount, m, 'replay frame count' );
	while ( b2.b2Replay_StepFrame( player ) );
	assert.ok( b2.b2Replay_IsAtEnd( player ) && !b2.b2Replay_HasDiverged( player ), 'replay reaches the end without diverging' );
	assert.equal( b2.b2World_GetStateHash( b2.b2Replay_GetWorldId( player ) ), first, 'replayed world ends in the recorded state' );
	b2.b2DestroyReplay( player );
	b2.b2DestroyRecording( recording );
	b2.b2DestroyWorld( worldId );
	return { first, second };
}

// Every hand-written wrapper (callbacks, pointers, arrays, strings, handles) called at
// least once and checked against what Box2D does.
function wrappers( b2 )
{
	// base.h
	const logged = [];
	b2.b2SetLogFcn( ( message ) => logged.push( message ) );
	b2.b2SetAssertFcn( () => 1 );
	const ticks = b2.b2GetTicks();
	assert.equal( typeof ticks, 'bigint', 'b2GetTicks is uint64' );
	const reset = b2.b2GetMillisecondsAndReset( ticks );
	assert.ok( reset.milliseconds >= 0 && typeof reset.ticks === 'bigint' && reset.ticks >= ticks, 'b2GetMillisecondsAndReset' );
	assert.equal( b2.b2Hash( b2.B2_HASH_INIT, [ 1, 2, 3 ] ), ( ( ( 5381 * 33 + 1 ) * 33 + 2 ) * 33 + 3 ) >>> 0, 'b2Hash is djb2' );

	// math_functions.h / id.h
	const ln = b2.b2GetLengthAndNormalize( [ 3, 4 ] );
	assert.ok( ln.length === 5 && Math.abs( ln.normalized[ 0 ] - 0.6 ) < 1e-6 && Math.abs( ln.normalized[ 1 ] - 0.8 ) < 1e-6, 'b2GetLengthAndNormalize' );
	assert.deepEqual( b2.b2MakeAABB( [ 0, 0, 2, 1 ], 0.5 ), [ -0.5, -0.5, 2.5, 1.5 ], 'b2MakeAABB' );
	const contactId = { index1: 7, world0: 2, padding: 0, generation: 4000000000 };
	const stored = b2.b2StoreContactId( contactId );
	assert.deepEqual( stored, [ 7, 2, 4000000000 ], 'b2StoreContactId' );
	assert.deepEqual( b2.b2LoadContactId( stored ), contactId, 'b2LoadContactId' );

	// collision.h
	const offsetProxy = b2.b2MakeOffsetProxy( [ 1, 0 ], 0.1, [ 0, 2 ], b2.b2MakeRot( 0.5 * b2.B2_PI ) );
	assert.ok( offsetProxy.count === 1 && Math.abs( offsetProxy.points[ 0 ] ) < 1e-6 && Math.abs( offsetProxy.points[ 1 ] - 3 ) < 1e-6, 'b2MakeOffsetProxy' );
	const simplexes = [];
	const out = b2.b2ShapeDistance( {
		proxyA: b2.b2MakeProxy( [ -1, -1, 1, -1, 1, 1, -1, 1 ], 0 ), proxyB: b2.b2MakeProxy( [ -1, -1, 1, -1, 1, 1, -1, 1 ], 0 ),
		transform: { p: [ 5, 0.5 ], q: [ 1, 0 ] }, useRadii: false,
	}, { ...b2.b2_emptySimplexCache }, simplexes, 8 );
	assert.ok( Math.abs( out.distance - 3 ) < 1e-5 && simplexes.length === out.simplexCount && simplexes.length > 0, 'b2ShapeDistance debug simplexes' );
	const chainSeg = { ghost1: [ -2, 0 ], segment: { point1: [ -1, 0 ], point2: [ 1, 0 ] }, ghost2: [ 2, 0 ], chainId: -1 };
	const cache = { ...b2.b2_emptySimplexCache };
	// chain segments collide on their right side: point1 -> point2 runs +x, so the solid side is below
	const cm = b2.b2CollideChainSegmentAndPolygon( chainSeg, b2.b2MakeSquare( 0.5 ), { p: [ 0, -0.45 ], q: [ 1, 0 ] }, cache );
	assert.equal( cm.pointCount, 2, 'b2CollideChainSegmentAndPolygon' );
	const cc = b2.b2CollideChainSegmentAndCapsule( chainSeg, { center1: [ -0.5, 0 ], center2: [ 0.5, 0 ], radius: 0.25 }, { p: [ 0, -0.2 ], q: [ 1, 0 ] }, cache );
	assert.equal( cc.pointCount, 2, 'b2CollideChainSegmentAndCapsule' );
	const tree = b2.b2CreateDynamicTree( 4 );
	const a = b2.b2CreateTreeProxy( tree, [ 0, 0, 1, 1 ], 2n, 10n );
	const b = b2.b2CreateTreeProxy( tree, [ 5, 0, 6, 1 ], 4n, 20n );
	assert.equal( b2.b2DynamicTree_GetProxyCount( tree ), 2, 'tree proxy count' );
	let all = 0;
	b2.b2DynamicTree_QueryAll( tree, [ -10, -10, 10, 10 ], () => { all++; return true; } );
	assert.equal( all, 2, 'b2DynamicTree_QueryAll' );
	const rayHits = [];
	b2.b2DynamicTree_CastRay( tree, { origin: [ -1, 0.5 ], translation: [ 10, 0 ], maxFraction: 1 }, 4n, ( input, proxyId, userData ) =>
	{
		rayHits.push( userData );
		return input.maxFraction;
	} );
	assert.deepEqual( rayHits, [ 20n ], 'b2DynamicTree_CastRay honors the mask bits' );
	const boxHits = [];
	b2.b2DynamicTree_CastBox( tree, { box: [ -2, 0.25, -1.5, 0.75 ], translation: [ 10, 0 ], maxFraction: 1 }, b2.B2_DEFAULT_MASK_BITS, ( input, proxyId ) =>
	{
		boxHits.push( proxyId );
		return input.maxFraction;
	} );
	assert.equal( boxHits.length, 2, 'b2DynamicTree_CastBox' );
	b2.b2DynamicTree_MoveProxy( tree, a, [ 2, 2, 3, 3 ] );
	assert.deepEqual( b2.b2DynamicTree_GetAABB( tree, a ).slice( 0, 2 ), [ 2, 2 ], 'b2DynamicTree_MoveProxy / GetAABB' );
	b2.b2DynamicTree_SetCategoryBits( tree, b, 8n );
	assert.equal( b2.b2DynamicTree_GetCategoryBits( tree, b ), 8n, 'tree category bits' );
	assert.equal( b2.b2DynamicTree_GetUserData( tree, b ), 20n, 'tree user data' );
	assert.ok( b2.b2DynamicTree_GetHeight( tree ) >= 1 && b2.b2DynamicTree_GetAreaRatio( tree ) >= 0 && b2.b2DynamicTree_GetByteCount( tree ) > 0, 'tree stats' );
	assert.deepEqual( b2.b2DynamicTree_GetRootBounds( tree ).length, 4, 'tree root bounds' );
	b2.b2DynamicTree_Validate( tree );
	b2.b2DestroyTreeProxy( tree, a );
	assert.equal( b2.b2DynamicTree_GetProxyCount( tree ), 1, 'b2DestroyTreeProxy' );
	b2.b2DestroyDynamicTree( tree );

	// world: restitution callback, custom filter, user data, explosion, snapshot log
	const worldId = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	b2.b2World_SetUserData( worldId, 99 );
	assert.equal( b2.b2World_GetUserData( worldId ), 99, 'b2World_SetUserData' );
	groundBox( b2, worldId );
	let restitutionCalls = 0;
	b2.b2World_SetRestitutionCallback( worldId, () => { restitutionCalls++; return 1; } );
	b2.b2World_SetFrictionCallback( worldId, ( fa, ma, fb, mb ) => Math.sqrt( fa * fb ) );
	const ball = dynamicBody( b2, worldId, [ 0, 3 ] );
	b2.b2CreateCircleShape( ball, b2.b2DefaultShapeDef(), { center: [ 0, 0 ], radius: 0.25 } );
	const ghostDef = b2.b2DefaultShapeDef();
	ghostDef.enableCustomFiltering = true;
	const ghost = dynamicBody( b2, worldId, [ 3, 3 ] );
	b2.b2CreateCircleShape( ghost, ghostDef, { center: [ 0, 0 ], radius: 0.25 } );
	let filterCalls = 0;
	b2.b2World_SetCustomFilterCallback( worldId, () => { filterCalls++; return false; } );
	let maxBounce = 0;
	for ( let i = 0; i < 120; i++ )
	{
		b2.b2World_Step( worldId, 1 / 60, 4 );
		if ( i > 40 ) maxBounce = Math.max( maxBounce, b2.b2Body_GetPosition( [ 0, 0 ], ball )[ 1 ] );
	}
	assert.ok( restitutionCalls > 0 && maxBounce > 1.5, `restitution callback makes the ball bounce (peak ${maxBounce.toFixed( 2 )})` );
	assert.ok( filterCalls > 0 && b2.b2Body_GetPosition( [ 0, 0 ], ghost )[ 1 ] < -1, 'custom filter returning false lets the ghost fall through the ground' );
	b2.b2World_SetRestitutionCallback( worldId, null );
	b2.b2World_SetFrictionCallback( worldId, null );
	b2.b2World_SetCustomFilterCallback( worldId, null );
	const explosion = b2.b2DefaultExplosionDef();
	explosion.position = [ 0, 0 ];
	explosion.radius = 5;
	explosion.impulsePerLength = 10;
	b2.b2World_Explode( worldId, explosion );
	const image = b2.b2World_GetSnapshot( worldId );
	image[ 8 ] ^= 0xff; // corrupt the layout hash
	assert.equal( b2.b2World_Restore( worldId, image ), false, 'a corrupt snapshot is rejected' );
	assert.ok( logged.some( ( m ) => m.includes( 'snapshot layout mismatch' ) ), 'b2SetLogFcn receives Box2D log messages' );

	// shape / joint user data, body name
	const shapes = b2.b2Body_GetShapes( ball );
	const shapeId = shapes.get( 0 );
	shapes.delete();
	b2.b2Shape_SetUserData( shapeId, 31 );
	assert.equal( b2.b2Shape_GetUserData( shapeId ), 31, 'shape user data' );
	b2.b2Body_SetName( ball, 'ball' );
	assert.equal( b2.b2Body_GetName( ball ), 'ball', 'b2Body_SetName' );
	const jd = b2.b2DefaultDistanceJointDef();
	jd.base.bodyIdA = ball; jd.base.bodyIdB = ghost; jd.base.userData = 3;
	const jointId = b2.b2CreateDistanceJoint( worldId, jd );
	assert.equal( b2.b2Joint_GetUserData( jointId ), 3, 'joint user data from the def' );
	b2.b2Joint_SetUserData( jointId, 4 );
	assert.equal( b2.b2Joint_GetUserData( jointId ), 4, 'b2Joint_SetUserData' );
	b2.b2DestroyWorld( worldId );

	// replay inspection: frame queries, seeking, keyframes, body outliner, query draw
	const recWorld = b2.b2CreateWorld( b2.b2DefaultWorldDef() );
	const recording = b2.b2CreateRecording( 1 << 16 );
	b2.b2World_StartRecording( recWorld, recording );
	groundBox( b2, recWorld );
	const faller = dynamicBody( b2, recWorld, [ 0, 5 ] );
	b2.b2CreatePolygonShape( faller, b2.b2DefaultShapeDef(), b2.b2MakeBox( 0.5, 0.5 ) );
	for ( let i = 0; i < 30; i++ )
	{
		b2.b2World_Step( recWorld, 1 / 60, 4 );
		b2.b2World_CastRayClosest( recWorld, [ 0, 10 ], [ 0, -20 ], b2.b2DefaultQueryFilter() );
	}
	b2.b2World_StopRecording( recWorld );
	const player = b2.b2CreateReplay( b2.b2Recording_GetData( recording ), 0 );
	b2.b2Replay_SetKeyframePolicy( player, 1 << 20, 4 );
	assert.equal( b2.b2Replay_GetKeyframeBudget( player ), 1 << 20, 'keyframe budget' );
	assert.equal( b2.b2Replay_GetKeyframeMinInterval( player ), 4, 'keyframe min interval' );
	b2.b2Replay_Restart( player );
	b2.b2Replay_SeekFrame( player, 20 );
	assert.equal( b2.b2Replay_GetFrame( player ), 20, 'b2Replay_SeekFrame' );
	assert.ok( b2.b2Replay_GetKeyframeInterval( player ) >= 4 && b2.b2Replay_GetKeyframeBytes( player ) > 0, 'keyframes kept while seeking' );
	b2.b2Replay_StepFrame( player );
	assert.equal( b2.b2Replay_GetFrameQueryCount( player ), 1, 'the recorded ray query is visible on the frame' );
	const query = b2.b2Replay_GetFrameQuery( player, 0 );
	assert.equal( query.type, b2.b2ReplayQueryType.b2_replayQueryCastRayClosest, 'recorded query type' );
	assert.equal( query.hitCount, 1, 'recorded query hit count' );
	const qhit = b2.b2Replay_GetFrameQueryHit( player, 0, 0 );
	assert.ok( qhit.fraction > 0 && qhit.fraction < 1, 'recorded query hit' );
	let queryLines = 0;
	const draw = b2.b2DefaultDebugDraw();
	draw.DrawLineFcn = () => { queryLines++; };
	draw.DrawPointFcn = () => {};
	b2.b2Replay_DrawFrameQueries( player, draw, -1 );
	assert.ok( queryLines > 0, 'b2Replay_DrawFrameQueries draws the recorded ray' );
	assert.equal( b2.b2Replay_GetBodyCount( player ), 2, 'replay body outliner' );
	assert.ok( b2.b2Body_IsValid( b2.b2Replay_GetBodyId( player, 1 ) ), 'b2Replay_GetBodyId' );
	assert.equal( b2.b2Replay_GetDivergeFrame( player ), -1, 'replay has not diverged' );
	b2.b2DestroyReplay( player );
	b2.b2DestroyRecording( recording );
	b2.b2DestroyWorld( recWorld );
}

// A JS allocator handed to b2SetAllocator carries every Box2D allocation (a fresh module
// instance, since the allocator must be set before Box2D allocates anything).
function allocator( b2 )
{
	const live = new Map(); // aligned address -> raw _malloc address
	let allocs = 0, frees = 0;
	b2.b2SetAllocator( ( size, alignment ) =>
	{
		allocs++;
		const raw = b2._malloc( size + alignment );
		const aligned = ( raw + alignment - 1 ) & -alignment;
		live.set( aligned, raw );
		return aligned;
	}, ( mem ) =>
	{
		frees++;
		b2._free( live.get( mem ) );
		live.delete( mem );
	} );
	const det = runDeterminism( b2 );
	assert.ok( allocs > 0 && frees > 0, 'the JS allocator served Box2D' );
	assert.equal( det.hash, EXPECTED_HASH, 'simulation through a JS allocator is unchanged' );
	b2.b2SetAllocator( null, null );
	return { allocs, frees };
}

// Every function declared in Box2D's public headers is on the module, or reached through
// the named buffer reader, or needs something this build does not link.
function coverage( b2 )
{
	const VIA = {
		b2World_GetBodyEvents: 'getEvents', b2World_GetSensorEvents: 'getEvents', b2World_GetContactEvents: 'getEvents',
		b2World_GetJointEvents: 'getEvents', b2Body_GetContactData: 'getBodyContactData', b2Shape_GetContactData: 'getShapeContactData',
	};
	const NOT_LINKED = {
		b2SaveRecordingToFile: 'needs a filesystem (FILESYSTEM=0)', b2LoadRecordingFromFile: 'needs a filesystem (FILESYSTEM=0)',
		b2InternalAssert: 'exists only in builds without NDEBUG',
	};
	const dir = new URL( '../vendor/box2d/include/box2d/', import.meta.url );
	const names = [];
	for ( const file of [ 'base.h', 'math_functions.h', 'id.h', 'collision.h', 'types.h', 'box2d.h' ] )
	{
		const src = readFileSync( new URL( file, dir ), 'utf8' ).replace( /\/\/.*$/gm, '' ).replace( /\/\*[^]*?\*\//g, '' );
		for ( const m of src.matchAll( /\b(?:B2_API|B2_INLINE|B2_ID_INLINE)\s+[^;{]*?\b(b2\w+)\s*\([^)]*\)\s*[;{]/g ) ) names.push( m[ 1 ] );
	}
	const unbound = names.filter( ( n ) => typeof b2[ n ] !== 'function' && !( n in VIA ) && !( n in NOT_LINKED ) );
	assert.deepEqual( unbound, [], 'every public Box2D function is bound' );
	for ( const [ n, via ] of Object.entries( VIA ) ) assert.equal( typeof b2[ via ], 'function', `${n} is reached through ${via}` );
	return { total: names.length, direct: names.filter( ( n ) => typeof b2[ n ] === 'function' ).length };
}

async function load( importPath )
{
	const { default: Box2D } = await import( importPath );
	return Box2D();
}

async function check( label, importPath )
{
	const b2 = await load( importPath );
	const v = b2.b2GetVersion();
	const { startY, endY } = fallingBody( b2 );
	contactsAndEvents( b2 );
	const { planeCount } = sensorsAndMover( b2 );
	queries( b2 );
	const jointCount = allJoints( b2 );
	chainShape( b2 );
	surface( b2 );
	const det = runDeterminism( b2 );
	snapshotRestore( b2 );
	wrappers( b2 );
	const cov = coverage( b2 );
	const alloc = allocator( await load( importPath ) );
	console.log( `  ${label}: box2d v${v.major}.${v.minor}.${v.revision} — circle fell ${startY.toFixed( 2 )} -> ${endY.toFixed( 2 )}; ` +
		`contacts, events, sensors and ${planeCount} mover plane(s) read from the buffers; ${jointCount} joint types; chain; ` +
		`snapshot/restore and replay repeat the state hash; ${cov.direct}/${cov.total} header functions bound directly (events and contact data via the buffers; file I/O and the debug-only assert not linked); ` +
		`JS allocator served ${alloc.allocs} allocations` );
	console.log( `    determinism: sleepStep=${det.sleepStep} hash=${formatHash( det.hash )} stateHash=${formatHash( det.stateHash, 16 )}` );
	return det;
}

console.log( 'box2d.js smoke test' );
const separate = await check( 'separate-wasm', '../dist/box2d.mjs' );
const inline = await check( 'inline       ', '../dist/box2d.inline.mjs' );

assert.equal( inline.hash, separate.hash, 'transform hash is identical between the separate-wasm and inline builds' );
assert.equal( inline.stateHash, separate.stateHash, 'b2World_GetStateHash is identical between the separate-wasm and inline builds' );
assert.equal( inline.sleepStep, EXPECTED_SLEEP_STEP, `sleep step matches Box2D's cross-platform expectation (${EXPECTED_SLEEP_STEP})` );
assert.equal( inline.hash, EXPECTED_HASH, `transform hash matches Box2D's cross-platform expectation (0x${EXPECTED_HASH.toString( 16 ).toUpperCase()})` );

// The pthread builds: Box2D's internal scheduler on the Emscripten pthread pool gives the
// same answer at any worker count.
for ( const [ label, path ] of [ [ 'mt           ', '../dist/box2d.mt.mjs' ], [ 'mt-inline    ', '../dist/box2d.mt.inline.mjs' ] ] )
{
	const b2 = await load( path );
	for ( const workers of [ 1, 4 ] )
	{
		const det = runDeterminism( b2, workers );
		assert.equal( det.workers, workers, `${label} world runs ${workers} worker(s)` );
		assert.equal( det.sleepStep, EXPECTED_SLEEP_STEP, `${label} workers=${workers} sleep step` );
		assert.equal( det.hash, EXPECTED_HASH, `${label} workers=${workers} transform hash` );
		assert.equal( det.stateHash, separate.stateHash, `${label} workers=${workers} state hash` );
	}
	console.log( `  ${label}: workerCount 1 and 4 reproduce the same determinism hashes` );
}

console.log( `determinism hash ${formatHash( inline.hash )} (Box2D expects ${formatHash( EXPECTED_HASH )}), ` +
	`sleep step ${inline.sleepStep} (Box2D expects ${EXPECTED_SLEEP_STEP}), b2World_GetStateHash ${formatHash( inline.stateHash, 16 )}` );
console.log( 'OK' );
process.exit( 0 );
