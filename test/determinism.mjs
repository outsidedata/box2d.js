// Box2D's cross-platform determinism scene (vendor/box2d/shared/determinism.c:
// CreateFallingHinges / UpdateFallingHinges), ported call for call. No Node or browser
// dependencies: test/smoke.mjs runs it in Node, test/determinism.html in a browser, so the
// printed hashes can be compared across machines and browsers.

// Box2D's expectation for this scene (vendor/box2d/shared/determinism.h, single
// precision): the step on which every body is asleep, and the djb2 hash (b2Hash) of every
// body's b2WorldTransform bytes at that step. Box2D asserts these on every platform it
// supports; matching them here is the cross-platform proof.
export const EXPECTED_SLEEP_STEP = 295;
export const EXPECTED_HASH = 0x36564C94;

export function createFallingHinges( b2, worldId )
{
	{
		const bodyDef = b2.b2DefaultBodyDef();
		bodyDef.position = [ 0, -1 ];
		const groundId = b2.b2CreateBody( worldId, bodyDef );
		const box = b2.b2MakeBox( 40, 1 );
		b2.b2CreatePolygonShape( groundId, b2.b2DefaultShapeDef(), box );
	}

	const columnCount = 4;
	const rowCount = 20;
	const bodyIds = [];

	// float arithmetic exactly as the C code does it (every product and sum rounded to float)
	const f = Math.fround;
	const h = 0.25;
	const r = f( f( 0.1 ) * h );
	let box = b2.b2MakeRoundedBox( h - r, h - r, r );
	box = b2.b2MakeSquare( h );

	const shapeDef = b2.b2DefaultShapeDef();

	const jointDef = b2.b2DefaultRevoluteJointDef();
	jointDef.enableLimit = true;
	jointDef.lowerAngle = f( f( -0.1 ) * b2.B2_PI );
	jointDef.upperAngle = f( f( 0.2 ) * b2.B2_PI );
	jointDef.enableSpring = true;
	jointDef.hertz = 1;
	jointDef.dampingRatio = 1;
	jointDef.enableMotor = true;
	jointDef.maxMotorTorque = 0.25;
	jointDef.base.localFrameA.p = [ -h, h ];
	jointDef.base.localFrameB.p = [ -h, -h ];
	jointDef.base.constraintHertz = 60;
	jointDef.base.constraintDampingRatio = 0;
	jointDef.base.drawScale = 0.5;

	const offset = f( f( 0.4 ) * h );
	const dx = f( 10 * h );
	const xBase = f( f( -0.5 * dx ) * ( columnCount - 1 ) );

	for ( let j = 0; j < columnCount; ++j )
	{
		const x = f( xBase + f( j * dx ) );
		let prevBodyId = b2.b2_nullBodyId;
		for ( let i = 0; i < rowCount; ++i )
		{
			const bodyDef = b2.b2DefaultBodyDef();
			bodyDef.type = b2.b2BodyType.b2_dynamicBody;
			bodyDef.position = [ f( x + f( offset * i ) ), f( h + f( f( 2 * h ) * i ) ) ];
			// this tests the deterministic cosine and sine functions
			const angle = ( i & 1 ) === 0 ? -0.1 : 0.1;
			bodyDef.rotation = b2.b2MakeRot( angle );
			const bodyId = b2.b2CreateBody( worldId, bodyDef );
			if ( ( i & 1 ) === 0 )
			{
				prevBodyId = bodyId;
			}
			else
			{
				jointDef.base.bodyIdA = prevBodyId;
				jointDef.base.bodyIdB = bodyId;
				b2.b2CreateRevoluteJoint( worldId, jointDef );
				prevBodyId = b2.b2_nullBodyId;
			}
			b2.b2CreatePolygonShape( bodyId, shapeDef, box );
			bodyIds.push( bodyId );
		}
	}
	if ( bodyIds.length !== rowCount * columnCount ) throw new Error( 'falling hinges: wrong body count' );
	return { bodyIds, stepCount: 0, sleepStep: -1, hash: 0 };
}

// djb2 over each body's b2WorldTransform bytes (p.x, p.y, q.c, q.s as little-endian
// float32), through Box2D's own b2Hash.
export function hashTransforms( b2, bodyIds )
{
	const p = [ 0, 0 ], q = [ 1, 0 ];
	const f32 = new Float32Array( 4 );
	const bytes = new Uint8Array( f32.buffer );
	let hash = b2.B2_HASH_INIT;
	for ( const bodyId of bodyIds )
	{
		b2.b2Body_GetTransform( p, q, bodyId );
		f32[ 0 ] = p[ 0 ]; f32[ 1 ] = p[ 1 ]; f32[ 2 ] = q[ 0 ]; f32[ 3 ] = q[ 1 ];
		hash = b2.b2Hash( hash, bytes );
	}
	return hash >>> 0;
}

export function updateFallingHinges( b2, worldId, eb, data )
{
	if ( data.hash === 0 )
	{
		b2.getEvents( eb, worldId );
		if ( b2.getNumBodyMoveEvents( eb ) === 0 )
		{
			if ( b2.b2World_GetAwakeBodyCount( worldId ) !== 0 ) throw new Error( 'falling hinges: no move events but bodies awake' );
			data.hash = hashTransforms( b2, data.bodyIds );
			data.sleepStep = data.stepCount;
		}
	}
	data.stepCount += 1;
	return data.hash !== 0;
}

// Run the scene to sleep (Box2D's CrossPlatformTest). workerCount is left at the
// b2DefaultWorldDef value unless given. Returns the sleep step, the transform hash and
// b2World_GetStateHash at that step.
export function runDeterminism( b2, workerCount )
{
	const worldDef = b2.b2DefaultWorldDef();
	if ( workerCount !== undefined ) worldDef.workerCount = workerCount;
	const worldId = b2.b2CreateWorld( worldDef );
	const workers = b2.b2World_GetWorkerCount( worldId );
	const eb = b2.createEventsBuffer();
	const data = createFallingHinges( b2, worldId );
	let done = false;
	while ( done === false )
	{
		b2.b2World_Step( worldId, 1 / 60, 4 );
		done = updateFallingHinges( b2, worldId, eb, data );
		if ( data.stepCount > 2000 ) throw new Error( 'falling hinges never fell asleep' );
	}
	const stateHash = b2.b2World_GetStateHash( worldId );
	b2.destroyEventsBuffer( eb );
	b2.b2DestroyWorld( worldId );
	return { sleepStep: data.sleepStep, hash: data.hash, stateHash, workers };
}

export function formatHash( hash, digits = 8 )
{
	return '0x' + hash.toString( 16 ).toUpperCase().padStart( digits, '0' );
}
