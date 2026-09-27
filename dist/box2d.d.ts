// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
interface WasmModule {
  _malloc(_0: number): number;
  _free(_0: number): void;
}

type EmbindString = ArrayBuffer|Uint8Array|Uint8ClampedArray|Int8Array|string;
export interface ClassHandle {
  isAliasOf(other: ClassHandle): boolean;
  delete(): void;
  deleteLater(): this;
  isDeleted(): boolean;
  // @ts-ignore - If targeting lower than ESNext, this symbol might not exist.
  [Symbol.dispose](): void;
  clone(): this;
}
export interface b2TOIStateValue<T extends number> {
  value: T;
}
export type b2TOIState = b2TOIStateValue<0>|b2TOIStateValue<1>|b2TOIStateValue<2>|b2TOIStateValue<3>|b2TOIStateValue<4>;

export interface b2BodyTypeValue<T extends number> {
  value: T;
}
export type b2BodyType = b2BodyTypeValue<0>|b2BodyTypeValue<1>|b2BodyTypeValue<2>|b2BodyTypeValue<3>;

export interface b2ShapeTypeValue<T extends number> {
  value: T;
}
export type b2ShapeType = b2ShapeTypeValue<0>|b2ShapeTypeValue<1>|b2ShapeTypeValue<2>|b2ShapeTypeValue<3>|b2ShapeTypeValue<4>|b2ShapeTypeValue<5>;

export interface b2JointTypeValue<T extends number> {
  value: T;
}
export type b2JointType = b2JointTypeValue<0>|b2JointTypeValue<1>|b2JointTypeValue<2>|b2JointTypeValue<3>|b2JointTypeValue<4>|b2JointTypeValue<5>|b2JointTypeValue<6>|b2JointTypeValue<7>|b2JointTypeValue<8>;

export interface b2HexColorValue<T extends number> {
  value: T;
}
export type b2HexColor = b2HexColorValue<15792383>|b2HexColorValue<16444375>|b2HexColorValue<65535>|b2HexColorValue<8388564>|b2HexColorValue<15794175>|b2HexColorValue<16119260>|b2HexColorValue<16770244>|b2HexColorValue<0>|b2HexColorValue<16772045>|b2HexColorValue<255>|b2HexColorValue<9055202>|b2HexColorValue<10824234>|b2HexColorValue<14596231>|b2HexColorValue<6266528>|b2HexColorValue<8388352>|b2HexColorValue<13789470>|b2HexColorValue<16744272>|b2HexColorValue<6591981>|b2HexColorValue<16775388>|b2HexColorValue<14423100>|b2HexColorValue<65535>|b2HexColorValue<139>|b2HexColorValue<35723>|b2HexColorValue<12092939>|b2HexColorValue<11119017>|b2HexColorValue<25600>|b2HexColorValue<12433259>|b2HexColorValue<9109643>|b2HexColorValue<5597999>|b2HexColorValue<16747520>|b2HexColorValue<10040012>|b2HexColorValue<9109504>|b2HexColorValue<15308410>|b2HexColorValue<9419919>|b2HexColorValue<4734347>|b2HexColorValue<3100495>|b2HexColorValue<52945>|b2HexColorValue<9699539>|b2HexColorValue<16716947>|b2HexColorValue<49151>|b2HexColorValue<6908265>|b2HexColorValue<2003199>|b2HexColorValue<11674146>|b2HexColorValue<16775920>|b2HexColorValue<2263842>|b2HexColorValue<16711935>|b2HexColorValue<14474460>|b2HexColorValue<16316671>|b2HexColorValue<16766720>|b2HexColorValue<14329120>|b2HexColorValue<8421504>|b2HexColorValue<32768>|b2HexColorValue<11403055>|b2HexColorValue<15794160>|b2HexColorValue<16738740>|b2HexColorValue<13458524>|b2HexColorValue<4915330>|b2HexColorValue<16777200>|b2HexColorValue<15787660>|b2HexColorValue<15132410>|b2HexColorValue<16773365>|b2HexColorValue<8190976>|b2HexColorValue<16775885>|b2HexColorValue<11393254>|b2HexColorValue<15761536>|b2HexColorValue<14745599>|b2HexColorValue<16448210>|b2HexColorValue<13882323>|b2HexColorValue<9498256>|b2HexColorValue<16758465>|b2HexColorValue<16752762>|b2HexColorValue<2142890>|b2HexColorValue<8900346>|b2HexColorValue<7833753>|b2HexColorValue<11584734>|b2HexColorValue<16777184>|b2HexColorValue<65280>|b2HexColorValue<3329330>|b2HexColorValue<16445670>|b2HexColorValue<16711935>|b2HexColorValue<8388608>|b2HexColorValue<6737322>|b2HexColorValue<205>|b2HexColorValue<12211667>|b2HexColorValue<9662683>|b2HexColorValue<3978097>|b2HexColorValue<8087790>|b2HexColorValue<64154>|b2HexColorValue<4772300>|b2HexColorValue<13047173>|b2HexColorValue<1644912>|b2HexColorValue<16121850>|b2HexColorValue<16770273>|b2HexColorValue<16770229>|b2HexColorValue<16768685>|b2HexColorValue<128>|b2HexColorValue<16643558>|b2HexColorValue<8421376>|b2HexColorValue<7048739>|b2HexColorValue<16753920>|b2HexColorValue<16729344>|b2HexColorValue<14315734>|b2HexColorValue<15657130>|b2HexColorValue<10025880>|b2HexColorValue<11529966>|b2HexColorValue<14381203>|b2HexColorValue<16773077>|b2HexColorValue<16767673>|b2HexColorValue<13468991>|b2HexColorValue<16761035>|b2HexColorValue<14524637>|b2HexColorValue<11591910>|b2HexColorValue<8388736>|b2HexColorValue<6697881>|b2HexColorValue<16711680>|b2HexColorValue<12357519>|b2HexColorValue<4286945>|b2HexColorValue<9127187>|b2HexColorValue<16416882>|b2HexColorValue<16032864>|b2HexColorValue<3050327>|b2HexColorValue<16774638>|b2HexColorValue<10506797>|b2HexColorValue<12632256>|b2HexColorValue<8900331>|b2HexColorValue<6970061>|b2HexColorValue<7372944>|b2HexColorValue<16775930>|b2HexColorValue<65407>|b2HexColorValue<4620980>|b2HexColorValue<13808780>|b2HexColorValue<32896>|b2HexColorValue<14204888>|b2HexColorValue<16737095>|b2HexColorValue<4251856>|b2HexColorValue<15631086>|b2HexColorValue<16113331>|b2HexColorValue<16777215>|b2HexColorValue<16119285>|b2HexColorValue<16776960>|b2HexColorValue<10145074>|b2HexColorValue<14430514>|b2HexColorValue<3190463>|b2HexColorValue<9226532>|b2HexColorValue<16772748>;

export interface b2ReplayQueryTypeValue<T extends number> {
  value: T;
}
export type b2ReplayQueryType = b2ReplayQueryTypeValue<0>|b2ReplayQueryTypeValue<1>|b2ReplayQueryTypeValue<2>|b2ReplayQueryTypeValue<3>|b2ReplayQueryTypeValue<4>|b2ReplayQueryTypeValue<5>|b2ReplayQueryTypeValue<6>|b2ReplayQueryTypeValue<7>|b2ReplayQueryTypeValue<8>;

export interface b2DynamicTree extends ClassHandle {
}

export interface b2ShapeIdVector extends ClassHandle, Iterable<b2ShapeId> {
  push_back(_0: b2ShapeId): void;
  resize(_0: number, _1: b2ShapeId): void;
  size(): number;
  get(_0: number): b2ShapeId | undefined;
  set(_0: number, _1: b2ShapeId): boolean;
}

export interface b2JointIdVector extends ClassHandle, Iterable<b2JointId> {
  push_back(_0: b2JointId): void;
  resize(_0: number, _1: b2JointId): void;
  size(): number;
  get(_0: number): b2JointId | undefined;
  set(_0: number, _1: b2JointId): boolean;
}

export interface ContactsBufferImpl extends ClassHandle {
  loadFromBody(_0: b2BodyId): void;
  loadFromShape(_0: b2ShapeId): void;
  count(): number;
  i32Ptr(): number;
  f32Ptr(): number;
}

export interface EventsBufferImpl extends ClassHandle {
  loadFrom(_0: b2WorldId): void;
  contactBeginCount(): number;
  contactEndCount(): number;
  contactHitCount(): number;
  bodyMoveCount(): number;
  sensorBeginCount(): number;
  sensorEndCount(): number;
  jointCount(): number;
  contactBeginPtr(): number;
  contactEndPtr(): number;
  contactHitI32Ptr(): number;
  contactHitF64Ptr(): number;
  bodyMoveI32Ptr(): number;
  bodyMoveF64Ptr(): number;
  sensorBeginPtr(): number;
  sensorEndPtr(): number;
  jointPtr(): number;
}

export type b2MotionLocks = {
  linearX: boolean,
  linearY: boolean,
  angularZ: boolean
};

export type b2WorldId = {
  index1: number,
  generation: number
};

export type b2Version = {
  major: number,
  minor: number,
  revision: number
};

export type b2BodyId = {
  index1: number,
  world0: number,
  generation: number
};

export type b2ShapeId = {
  index1: number,
  world0: number,
  generation: number
};

export type b2SensorBeginTouchEvent = {
  sensorShapeId: b2ShapeId,
  visitorShapeId: b2ShapeId
};

export type b2SensorEndTouchEvent = {
  sensorShapeId: b2ShapeId,
  visitorShapeId: b2ShapeId
};

export type b2ChainId = {
  index1: number,
  world0: number,
  generation: number
};

export type b2JointId = {
  index1: number,
  world0: number,
  generation: number
};

export type b2TreeStats = {
  nodeVisits: number,
  leafVisits: number
};

export type b2Capacity = {
  staticShapeCount: number,
  dynamicShapeCount: number,
  staticBodyCount: number,
  dynamicBodyCount: number,
  contactCount: number
};

export type b2ContactId = {
  index1: number,
  world0: number,
  padding: number,
  generation: number
};

export type b2ContactBeginTouchEvent = {
  shapeIdA: b2ShapeId,
  shapeIdB: b2ShapeId,
  contactId: b2ContactId
};

export type b2ContactEndTouchEvent = {
  shapeIdA: b2ShapeId,
  shapeIdB: b2ShapeId,
  contactId: b2ContactId
};

export type b2JointEvent = {
  jointId: b2JointId,
  userData: number
};

export type b2Filter = {
  categoryBits: bigint,
  maskBits: bigint,
  groupIndex: number
};

export type b2QueryFilter = {
  categoryBits: bigint,
  maskBits: bigint
};

export type b2Vec2 = [ number, number ];

export type b2Mat22 = {
  cx: b2Vec2,
  cy: b2Vec2
};

export type b2Segment = {
  point1: b2Vec2,
  point2: b2Vec2
};

export type b2ChainSegment = {
  ghost1: b2Vec2,
  segment: b2Segment,
  ghost2: b2Vec2,
  chainId: number
};

export type b2PlaneSolverResult = {
  delta: b2Vec2,
  iterationCount: number
};

export type b2ChainDef = {
  userData: number,
  ghost1: b2Vec2,
  ghost2: b2Vec2,
  filter: b2Filter,
  isLoop: boolean,
  enableSensorEvents: boolean,
  internalValue: number,
  points?: ArrayLike<number>,
  materials?: b2SurfaceMaterial[]
};

export type b2Rot = [ number, number ];

export type b2Transform = {
  p: b2Vec2,
  q: b2Rot
};

export type b2BodyMoveEvent = {
  userData: number,
  transform: b2Transform,
  bodyId: b2BodyId,
  fellAsleep: boolean
};

export type b2Sweep = {
  localCenter: b2Vec2,
  c1: b2Vec2,
  c2: b2Vec2,
  q1: b2Rot,
  q2: b2Rot
};

export type b2CosSin = {
  cosine: number,
  sine: number
};

export type b2AABB = [ number, number, number, number ];

export type b2ReplayQueryInfo = {
  type: b2ReplayQueryType,
  filter: b2QueryFilter,
  aabb: b2AABB,
  origin: b2Vec2,
  translation: b2Vec2,
  shape: b2ShapeId,
  hitCount: number
};

export type b2Plane = {
  normal: b2Vec2,
  offset: number
};

export type b2PlaneResult = {
  plane: b2Plane,
  point: b2Vec2,
  hit: boolean
};

export type b2RayCastInput = {
  origin: b2Vec2,
  translation: b2Vec2,
  maxFraction: number
};

export type b2CastOutput = {
  normal: b2Vec2,
  point: b2Vec2,
  fraction: number,
  iterations: number,
  hit: boolean
};

export type b2MassData = {
  mass: number,
  center: b2Vec2,
  rotationalInertia: number
};

export type b2Circle = {
  center: b2Vec2,
  radius: number
};

export type b2Capsule = {
  center1: b2Vec2,
  center2: b2Vec2,
  radius: number
};

export type b2SegmentDistanceResult = {
  closest1: b2Vec2,
  closest2: b2Vec2,
  fraction1: number,
  fraction2: number,
  distanceSquared: number
};

export type b2DistanceOutput = {
  pointA: b2Vec2,
  pointB: b2Vec2,
  normal: b2Vec2,
  distance: number,
  iterations: number,
  simplexCount: number
};

export type b2SimplexVertex = {
  wA: b2Vec2,
  wB: b2Vec2,
  w: b2Vec2,
  a: number,
  indexA: number,
  indexB: number
};

export type b2Simplex = {
  v1: b2SimplexVertex,
  v2: b2SimplexVertex,
  v3: b2SimplexVertex,
  count: number
};

export type b2TOIOutput = {
  state: b2TOIState,
  point: b2Vec2,
  normal: b2Vec2,
  fraction: number
};

export type b2ManifoldPoint = {
  anchorA: b2Vec2,
  anchorB: b2Vec2,
  separation: number,
  normalImpulse: number,
  tangentImpulse: number,
  totalNormalImpulse: number,
  normalVelocity: number,
  baseSeparation: number,
  id: number,
  persisted: boolean
};

export type b2LocalManifoldPoint = {
  point: b2Vec2,
  separation: number,
  id: number
};

export type b2BoxCastInput = {
  box: b2AABB,
  translation: b2Vec2,
  maxFraction: number
};

export type b2CollisionPlane = {
  plane: b2Plane,
  pushLimit: number,
  push: number,
  clipVelocity: boolean
};

export type b2RayResult = {
  shapeId: b2ShapeId,
  point: b2Vec2,
  normal: b2Vec2,
  fraction: number,
  nodeVisits: number,
  leafVisits: number,
  hit: boolean
};

export type b2WorldDef = {
  gravity: b2Vec2,
  restitutionThreshold: number,
  restitutionIterations: number,
  enableRestitutionPropagation: boolean,
  hitEventThreshold: number,
  contactHertz: number,
  contactDampingRatio: number,
  contactSpeed: number,
  maximumLinearSpeed: number,
  enableSleep: boolean,
  enableContinuous: boolean,
  workerCount: number,
  userData: number,
  capacity: b2Capacity,
  internalValue: number,
  frictionCallback?: ((frictionA: number, userMaterialIdA: bigint, frictionB: number, userMaterialIdB: bigint) => number) | null,
  restitutionCallback?: ((restitutionA: number, userMaterialIdA: bigint, restitutionB: number, userMaterialIdB: bigint) => number) | null
};

export type b2BodyDef = {
  type: b2BodyType,
  position: b2Vec2,
  rotation: b2Rot,
  linearVelocity: b2Vec2,
  angularVelocity: number,
  linearDamping: number,
  angularDamping: number,
  gravityScale: number,
  sleepThreshold: number,
  safetyFactor: number,
  userData: number,
  motionLocks: b2MotionLocks,
  enableSleep: boolean,
  isAwake: boolean,
  isBullet: boolean,
  isEnabled: boolean,
  allowFastRotation: boolean,
  enableContactRecycling: boolean,
  internalValue: number,
  name?: string | null
};

export type b2SurfaceMaterial = {
  friction: number,
  restitution: number,
  rollingResistance: number,
  tangentSpeed: number,
  userMaterialId: bigint,
  customColor: number
};

export type b2ShapeDef = {
  userData: number,
  material: b2SurfaceMaterial,
  density: number,
  filter: b2Filter,
  enableCustomFiltering: boolean,
  isSensor: boolean,
  enableSensorEvents: boolean,
  enableContactEvents: boolean,
  enableHitEvents: boolean,
  enablePreSolveEvents: boolean,
  invokeContactCreation: boolean,
  updateBodyMass: boolean,
  internalValue: number
};

export type b2Profile = {
  step: number,
  pairs: number,
  collide: number,
  solve: number,
  solverSetup: number,
  constraints: number,
  prepareConstraints: number,
  integrateVelocities: number,
  warmStart: number,
  solveImpulses: number,
  integratePositions: number,
  relaxImpulses: number,
  restitution: number,
  storeImpulses: number,
  splitIslands: number,
  transforms: number,
  sensorHits: number,
  jointEvents: number,
  hitEvents: number,
  refit: number,
  bullets: number,
  sleepIslands: number,
  sensors: number
};

export type b2JointDef = {
  userData: number,
  bodyIdA: b2BodyId,
  bodyIdB: b2BodyId,
  localFrameA: b2Transform,
  localFrameB: b2Transform,
  forceThreshold: number,
  torqueThreshold: number,
  constraintHertz: number,
  constraintDampingRatio: number,
  drawScale: number,
  collideConnected: boolean
};

export type b2FilterJointDef = {
  base: b2JointDef,
  internalValue: number
};

export type b2MoverJointDef = {
  base: b2JointDef,
  linearVelocity: b2Vec2,
  maxVelocityForce: b2Vec2,
  internalValue: number
};

export type b2DistanceJointDef = {
  base: b2JointDef,
  length: number,
  enableSpring: boolean,
  lowerSpringForce: number,
  upperSpringForce: number,
  hertz: number,
  dampingRatio: number,
  enableLimit: boolean,
  minLength: number,
  maxLength: number,
  enableMotor: boolean,
  maxMotorForce: number,
  motorSpeed: number,
  internalValue: number
};

export type b2MotorJointDef = {
  base: b2JointDef,
  linearVelocity: b2Vec2,
  maxVelocityForce: number,
  angularVelocity: number,
  maxVelocityTorque: number,
  linearHertz: number,
  linearDampingRatio: number,
  maxSpringForce: number,
  angularHertz: number,
  angularDampingRatio: number,
  maxSpringTorque: number,
  internalValue: number
};

export type b2PogoJointDef = {
  base: b2JointDef,
  normal: b2Vec2,
  hertz: number,
  dampingRatio: number,
  restLength: number,
  maxTensionForce: number,
  maxCompressionForce: number,
  impulse: number,
  velocity: number,
  internalValue: number
};

export type b2PrismaticJointDef = {
  base: b2JointDef,
  enableSpring: boolean,
  hertz: number,
  dampingRatio: number,
  targetTranslation: number,
  enableLimit: boolean,
  lowerTranslation: number,
  upperTranslation: number,
  enableMotor: boolean,
  maxMotorForce: number,
  motorSpeed: number,
  internalValue: number
};

export type b2RevoluteJointDef = {
  base: b2JointDef,
  targetAngle: number,
  enableSpring: boolean,
  hertz: number,
  dampingRatio: number,
  enableLimit: boolean,
  lowerAngle: number,
  upperAngle: number,
  enableMotor: boolean,
  maxMotorTorque: number,
  motorSpeed: number,
  internalValue: number
};

export type b2WeldJointDef = {
  base: b2JointDef,
  linearHertz: number,
  angularHertz: number,
  linearDampingRatio: number,
  angularDampingRatio: number,
  internalValue: number
};

export type b2WheelJointDef = {
  base: b2JointDef,
  enableSpring: boolean,
  hertz: number,
  dampingRatio: number,
  enableLimit: boolean,
  lowerTranslation: number,
  upperTranslation: number,
  enableMotor: boolean,
  maxMotorTorque: number,
  motorSpeed: number,
  internalValue: number
};

export type b2ExplosionDef = {
  maskBits: bigint,
  position: b2Vec2,
  radius: number,
  falloff: number,
  impulsePerLength: number
};

export type b2ContactHitEvent = {
  shapeIdA: b2ShapeId,
  shapeIdB: b2ShapeId,
  contactId: b2ContactId,
  point: b2Vec2,
  normal: b2Vec2,
  approachSpeed: number
};

export type b2DebugDraw = {
  drawingBounds: b2AABB,
  forceScale: number,
  jointScale: number,
  drawContacts: boolean,
  drawAnchorA: boolean,
  drawShapes: boolean,
  drawChainNormals: boolean,
  drawJoints: boolean,
  drawJointExtras: boolean,
  drawBounds: boolean,
  drawMass: boolean,
  drawBodyNames: boolean,
  drawGraphColors: boolean,
  drawContactFeatures: boolean,
  drawContactNormals: boolean,
  drawContactForces: boolean,
  drawFrictionForces: boolean,
  drawIslands: boolean,
  DrawPolygonFcn?: (transform: b2Transform, vertices: Float32Array, vertexCount: number, color: number) => void,
  DrawSolidPolygonFcn?: (transform: b2Transform, vertices: Float32Array, vertexCount: number, radius: number, color: number) => void,
  DrawCircleFcn?: (center: b2Vec2, radius: number, color: number) => void,
  DrawSolidCircleFcn?: (transform: b2Transform, center: b2Vec2, radius: number, color: number) => void,
  DrawSolidCapsuleFcn?: (p1: b2Vec2, p2: b2Vec2, radius: number, color: number) => void,
  DrawLineFcn?: (p1: b2Vec2, p2: b2Vec2, color: number) => void,
  DrawTransformFcn?: (transform: b2Transform) => void,
  DrawPointFcn?: (p: b2Vec2, size: number, color: number) => void,
  DrawStringFcn?: (p: b2Vec2, s: string, color: number) => void,
  DrawBoundsFcn?: (aabb: b2AABB, color: number) => void
};

export type b2ReplayInfo = {
  frameCount: number,
  workerCount: number,
  timeStep: number,
  subStepCount: number,
  lengthScale: number,
  bounds: b2AABB
};

export type b2ReplayQueryHit = {
  shape: b2ShapeId,
  point: b2Vec2,
  normal: b2Vec2,
  fraction: number
};

export type b2ShapeProxy = {
  points: ArrayLike<number>,
  count: number,
  radius: number
};

export type b2ShapeCastInput = {
  proxy: b2ShapeProxy,
  translation: b2Vec2,
  maxFraction: number,
  canEncroach: boolean
};

export type b2DistanceInput = {
  proxyA: b2ShapeProxy,
  proxyB: b2ShapeProxy,
  transform: b2Transform,
  useRadii: boolean
};

export type b2ShapeCastPairInput = {
  proxyA: b2ShapeProxy,
  proxyB: b2ShapeProxy,
  transform: b2Transform,
  translationB: b2Vec2,
  maxFraction: number,
  canEncroach: boolean
};

export type b2TOIInput = {
  proxyA: b2ShapeProxy,
  proxyB: b2ShapeProxy,
  sweepA: b2Sweep,
  sweepB: b2Sweep,
  maxFraction: number
};

export type b2Polygon = {
  vertices: ArrayLike<number>,
  normals: ArrayLike<number>,
  centroid: b2Vec2,
  radius: number,
  count: number
};

export type b2Hull = {
  points: ArrayLike<number>,
  count: number
};

export type b2SimplexCache = {
  count: number,
  indexA: number[],
  indexB: number[]
};

export type b2Manifold = {
  normal: b2Vec2,
  rollingImpulse: number,
  points: b2ManifoldPoint[],
  pointCount: number
};

export type b2ContactData = {
  contactId: b2ContactId,
  shapeIdA: b2ShapeId,
  shapeIdB: b2ShapeId,
  manifold: b2Manifold
};

export type b2LocalManifold = {
  normal: b2Vec2,
  points: b2LocalManifoldPoint[],
  pointCount: number
};

export type b2Counters = {
  byteCount: bigint,
  bodyCount: number,
  shapeCount: number,
  contactCount: number,
  jointCount: number,
  islandCount: number,
  stackUsed: number,
  staticTreeHeight: number,
  treeHeight: number,
  taskCount: number,
  colorCounts: number[],
  awakeContactCount: number,
  recycledContactCount: number
};

interface EmbindModule {
  b2TOIState: {b2_toiStateUnknown: b2TOIStateValue<0>, b2_toiStateFailed: b2TOIStateValue<1>, b2_toiStateOverlapped: b2TOIStateValue<2>, b2_toiStateHit: b2TOIStateValue<3>, b2_toiStateSeparated: b2TOIStateValue<4>};
  b2BodyType: {b2_staticBody: b2BodyTypeValue<0>, b2_kinematicBody: b2BodyTypeValue<1>, b2_dynamicBody: b2BodyTypeValue<2>, b2_bodyTypeCount: b2BodyTypeValue<3>};
  b2ShapeType: {b2_circleShape: b2ShapeTypeValue<0>, b2_capsuleShape: b2ShapeTypeValue<1>, b2_segmentShape: b2ShapeTypeValue<2>, b2_polygonShape: b2ShapeTypeValue<3>, b2_chainSegmentShape: b2ShapeTypeValue<4>, b2_shapeTypeCount: b2ShapeTypeValue<5>};
  b2JointType: {b2_distanceJoint: b2JointTypeValue<0>, b2_filterJoint: b2JointTypeValue<1>, b2_motorJoint: b2JointTypeValue<2>, b2_moverJoint: b2JointTypeValue<3>, b2_pogoJoint: b2JointTypeValue<4>, b2_prismaticJoint: b2JointTypeValue<5>, b2_revoluteJoint: b2JointTypeValue<6>, b2_weldJoint: b2JointTypeValue<7>, b2_wheelJoint: b2JointTypeValue<8>};
  b2HexColor: {b2_colorAliceBlue: b2HexColorValue<15792383>, b2_colorAntiqueWhite: b2HexColorValue<16444375>, b2_colorAqua: b2HexColorValue<65535>, b2_colorAquamarine: b2HexColorValue<8388564>, b2_colorAzure: b2HexColorValue<15794175>, b2_colorBeige: b2HexColorValue<16119260>, b2_colorBisque: b2HexColorValue<16770244>, b2_colorBlack: b2HexColorValue<0>, b2_colorBlanchedAlmond: b2HexColorValue<16772045>, b2_colorBlue: b2HexColorValue<255>, b2_colorBlueViolet: b2HexColorValue<9055202>, b2_colorBrown: b2HexColorValue<10824234>, b2_colorBurlywood: b2HexColorValue<14596231>, b2_colorCadetBlue: b2HexColorValue<6266528>, b2_colorChartreuse: b2HexColorValue<8388352>, b2_colorChocolate: b2HexColorValue<13789470>, b2_colorCoral: b2HexColorValue<16744272>, b2_colorCornflowerBlue: b2HexColorValue<6591981>, b2_colorCornsilk: b2HexColorValue<16775388>, b2_colorCrimson: b2HexColorValue<14423100>, b2_colorCyan: b2HexColorValue<65535>, b2_colorDarkBlue: b2HexColorValue<139>, b2_colorDarkCyan: b2HexColorValue<35723>, b2_colorDarkGoldenRod: b2HexColorValue<12092939>, b2_colorDarkGray: b2HexColorValue<11119017>, b2_colorDarkGreen: b2HexColorValue<25600>, b2_colorDarkKhaki: b2HexColorValue<12433259>, b2_colorDarkMagenta: b2HexColorValue<9109643>, b2_colorDarkOliveGreen: b2HexColorValue<5597999>, b2_colorDarkOrange: b2HexColorValue<16747520>, b2_colorDarkOrchid: b2HexColorValue<10040012>, b2_colorDarkRed: b2HexColorValue<9109504>, b2_colorDarkSalmon: b2HexColorValue<15308410>, b2_colorDarkSeaGreen: b2HexColorValue<9419919>, b2_colorDarkSlateBlue: b2HexColorValue<4734347>, b2_colorDarkSlateGray: b2HexColorValue<3100495>, b2_colorDarkTurquoise: b2HexColorValue<52945>, b2_colorDarkViolet: b2HexColorValue<9699539>, b2_colorDeepPink: b2HexColorValue<16716947>, b2_colorDeepSkyBlue: b2HexColorValue<49151>, b2_colorDimGray: b2HexColorValue<6908265>, b2_colorDodgerBlue: b2HexColorValue<2003199>, b2_colorFireBrick: b2HexColorValue<11674146>, b2_colorFloralWhite: b2HexColorValue<16775920>, b2_colorForestGreen: b2HexColorValue<2263842>, b2_colorFuchsia: b2HexColorValue<16711935>, b2_colorGainsboro: b2HexColorValue<14474460>, b2_colorGhostWhite: b2HexColorValue<16316671>, b2_colorGold: b2HexColorValue<16766720>, b2_colorGoldenRod: b2HexColorValue<14329120>, b2_colorGray: b2HexColorValue<8421504>, b2_colorGreen: b2HexColorValue<32768>, b2_colorGreenYellow: b2HexColorValue<11403055>, b2_colorHoneyDew: b2HexColorValue<15794160>, b2_colorHotPink: b2HexColorValue<16738740>, b2_colorIndianRed: b2HexColorValue<13458524>, b2_colorIndigo: b2HexColorValue<4915330>, b2_colorIvory: b2HexColorValue<16777200>, b2_colorKhaki: b2HexColorValue<15787660>, b2_colorLavender: b2HexColorValue<15132410>, b2_colorLavenderBlush: b2HexColorValue<16773365>, b2_colorLawnGreen: b2HexColorValue<8190976>, b2_colorLemonChiffon: b2HexColorValue<16775885>, b2_colorLightBlue: b2HexColorValue<11393254>, b2_colorLightCoral: b2HexColorValue<15761536>, b2_colorLightCyan: b2HexColorValue<14745599>, b2_colorLightGoldenRodYellow: b2HexColorValue<16448210>, b2_colorLightGray: b2HexColorValue<13882323>, b2_colorLightGreen: b2HexColorValue<9498256>, b2_colorLightPink: b2HexColorValue<16758465>, b2_colorLightSalmon: b2HexColorValue<16752762>, b2_colorLightSeaGreen: b2HexColorValue<2142890>, b2_colorLightSkyBlue: b2HexColorValue<8900346>, b2_colorLightSlateGray: b2HexColorValue<7833753>, b2_colorLightSteelBlue: b2HexColorValue<11584734>, b2_colorLightYellow: b2HexColorValue<16777184>, b2_colorLime: b2HexColorValue<65280>, b2_colorLimeGreen: b2HexColorValue<3329330>, b2_colorLinen: b2HexColorValue<16445670>, b2_colorMagenta: b2HexColorValue<16711935>, b2_colorMaroon: b2HexColorValue<8388608>, b2_colorMediumAquaMarine: b2HexColorValue<6737322>, b2_colorMediumBlue: b2HexColorValue<205>, b2_colorMediumOrchid: b2HexColorValue<12211667>, b2_colorMediumPurple: b2HexColorValue<9662683>, b2_colorMediumSeaGreen: b2HexColorValue<3978097>, b2_colorMediumSlateBlue: b2HexColorValue<8087790>, b2_colorMediumSpringGreen: b2HexColorValue<64154>, b2_colorMediumTurquoise: b2HexColorValue<4772300>, b2_colorMediumVioletRed: b2HexColorValue<13047173>, b2_colorMidnightBlue: b2HexColorValue<1644912>, b2_colorMintCream: b2HexColorValue<16121850>, b2_colorMistyRose: b2HexColorValue<16770273>, b2_colorMoccasin: b2HexColorValue<16770229>, b2_colorNavajoWhite: b2HexColorValue<16768685>, b2_colorNavy: b2HexColorValue<128>, b2_colorOldLace: b2HexColorValue<16643558>, b2_colorOlive: b2HexColorValue<8421376>, b2_colorOliveDrab: b2HexColorValue<7048739>, b2_colorOrange: b2HexColorValue<16753920>, b2_colorOrangeRed: b2HexColorValue<16729344>, b2_colorOrchid: b2HexColorValue<14315734>, b2_colorPaleGoldenRod: b2HexColorValue<15657130>, b2_colorPaleGreen: b2HexColorValue<10025880>, b2_colorPaleTurquoise: b2HexColorValue<11529966>, b2_colorPaleVioletRed: b2HexColorValue<14381203>, b2_colorPapayaWhip: b2HexColorValue<16773077>, b2_colorPeachPuff: b2HexColorValue<16767673>, b2_colorPeru: b2HexColorValue<13468991>, b2_colorPink: b2HexColorValue<16761035>, b2_colorPlum: b2HexColorValue<14524637>, b2_colorPowderBlue: b2HexColorValue<11591910>, b2_colorPurple: b2HexColorValue<8388736>, b2_colorRebeccaPurple: b2HexColorValue<6697881>, b2_colorRed: b2HexColorValue<16711680>, b2_colorRosyBrown: b2HexColorValue<12357519>, b2_colorRoyalBlue: b2HexColorValue<4286945>, b2_colorSaddleBrown: b2HexColorValue<9127187>, b2_colorSalmon: b2HexColorValue<16416882>, b2_colorSandyBrown: b2HexColorValue<16032864>, b2_colorSeaGreen: b2HexColorValue<3050327>, b2_colorSeaShell: b2HexColorValue<16774638>, b2_colorSienna: b2HexColorValue<10506797>, b2_colorSilver: b2HexColorValue<12632256>, b2_colorSkyBlue: b2HexColorValue<8900331>, b2_colorSlateBlue: b2HexColorValue<6970061>, b2_colorSlateGray: b2HexColorValue<7372944>, b2_colorSnow: b2HexColorValue<16775930>, b2_colorSpringGreen: b2HexColorValue<65407>, b2_colorSteelBlue: b2HexColorValue<4620980>, b2_colorTan: b2HexColorValue<13808780>, b2_colorTeal: b2HexColorValue<32896>, b2_colorThistle: b2HexColorValue<14204888>, b2_colorTomato: b2HexColorValue<16737095>, b2_colorTurquoise: b2HexColorValue<4251856>, b2_colorViolet: b2HexColorValue<15631086>, b2_colorWheat: b2HexColorValue<16113331>, b2_colorWhite: b2HexColorValue<16777215>, b2_colorWhiteSmoke: b2HexColorValue<16119285>, b2_colorYellow: b2HexColorValue<16776960>, b2_colorYellowGreen: b2HexColorValue<10145074>, b2_colorBox2DRed: b2HexColorValue<14430514>, b2_colorBox2DBlue: b2HexColorValue<3190463>, b2_colorBox2DGreen: b2HexColorValue<9226532>, b2_colorBox2DYellow: b2HexColorValue<16772748>};
  b2ReplayQueryType: {b2_replayQueryOverlapAABB: b2ReplayQueryTypeValue<0>, b2_replayQueryOverlapShape: b2ReplayQueryTypeValue<1>, b2_replayQueryCastRay: b2ReplayQueryTypeValue<2>, b2_replayQueryCastShape: b2ReplayQueryTypeValue<3>, b2_replayQueryCollideMover: b2ReplayQueryTypeValue<4>, b2_replayQueryCastRayClosest: b2ReplayQueryTypeValue<5>, b2_replayQueryCastMover: b2ReplayQueryTypeValue<6>, b2_replayQueryShapeTestPoint: b2ReplayQueryTypeValue<7>, b2_replayQueryShapeRayCast: b2ReplayQueryTypeValue<8>};
  b2DynamicTree: {};
  b2ShapeIdVector: {
    new(): b2ShapeIdVector;
  };
  b2JointIdVector: {
    new(): b2JointIdVector;
  };
  ContactsBufferImpl: {
    new(): ContactsBufferImpl;
  };
  EventsBufferImpl: {
    new(): EventsBufferImpl;
  };
  b2Yield(): void;
  b2DestroyDynamicTree(tree: b2DynamicTree | null): void;
  b2DynamicTree_Validate(tree: b2DynamicTree | null): void;
  b2IsDoublePrecision(): boolean;
  b2World_IsValid(id: b2WorldId): boolean;
  b2World_EnableSleeping(worldId: b2WorldId, flag: boolean): void;
  b2World_IsSleepingEnabled(worldId: b2WorldId): boolean;
  b2World_EnableContinuous(worldId: b2WorldId, flag: boolean): void;
  b2World_IsContinuousEnabled(worldId: b2WorldId): boolean;
  b2World_EnableRestitutionPropagation(worldId: b2WorldId, flag: boolean): void;
  b2World_IsRestitutionPropagationEnabled(worldId: b2WorldId): boolean;
  b2World_EnableWarmStarting(worldId: b2WorldId, flag: boolean): void;
  b2World_IsWarmStartingEnabled(worldId: b2WorldId): boolean;
  b2World_DumpMemoryStats(worldId: b2WorldId): void;
  b2World_RebuildStaticTree(worldId: b2WorldId): void;
  b2World_StopRecording(worldId: b2WorldId): void;
  b2DestroyWorld(worldId: b2WorldId): void;
  b2GetVersion(): b2Version;
  b2DestroyBody(bodyId: b2BodyId): void;
  b2Body_IsValid(id: b2BodyId): boolean;
  b2Body_GetType(bodyId: b2BodyId): b2BodyType;
  b2Body_SetType(bodyId: b2BodyId, type: b2BodyType): void;
  b2Body_ClearForces(bodyId: b2BodyId): void;
  b2Body_UpdateMassFromShapes(bodyId: b2BodyId): void;
  b2Body_IsAwake(bodyId: b2BodyId): boolean;
  b2Body_SetAwake(bodyId: b2BodyId, awake: boolean): void;
  b2Body_WakeTouching(bodyId: b2BodyId): void;
  b2Body_EnableSleep(bodyId: b2BodyId, enableSleep: boolean): void;
  b2Body_IsSleepEnabled(bodyId: b2BodyId): boolean;
  b2Body_IsEnabled(bodyId: b2BodyId): boolean;
  b2Body_Disable(bodyId: b2BodyId): void;
  b2Body_Enable(bodyId: b2BodyId): void;
  b2Body_SetMotionLocks(bodyId: b2BodyId, locks: b2MotionLocks): void;
  b2Body_GetMotionLocks(bodyId: b2BodyId): b2MotionLocks;
  b2Body_SetBullet(bodyId: b2BodyId, flag: boolean): void;
  b2Body_IsBullet(bodyId: b2BodyId): boolean;
  b2Body_EnableContactRecycling(bodyId: b2BodyId, flag: boolean): void;
  b2Body_IsContactRecyclingEnabled(bodyId: b2BodyId): boolean;
  b2Body_EnableContactEvents(bodyId: b2BodyId, flag: boolean): void;
  b2Body_EnableHitEvents(bodyId: b2BodyId, flag: boolean): void;
  b2Body_GetWorld(bodyId: b2BodyId): b2WorldId;
  b2Body_GetShapes(bodyId: b2BodyId): b2ShapeIdVector;
  b2Body_GetJoints(bodyId: b2BodyId): b2JointIdVector;
  b2DestroyShape(shapeId: b2ShapeId, updateBodyMass: boolean): void;
  b2Shape_IsValid(id: b2ShapeId): boolean;
  b2Shape_GetType(shapeId: b2ShapeId): b2ShapeType;
  b2Shape_GetBody(shapeId: b2ShapeId): b2BodyId;
  b2Shape_GetWorld(shapeId: b2ShapeId): b2WorldId;
  b2Shape_IsSensor(shapeId: b2ShapeId): boolean;
  b2Shape_EnableSensorEvents(shapeId: b2ShapeId, flag: boolean): void;
  b2Shape_AreSensorEventsEnabled(shapeId: b2ShapeId): boolean;
  b2Shape_EnableContactEvents(shapeId: b2ShapeId, flag: boolean): void;
  b2Shape_AreContactEventsEnabled(shapeId: b2ShapeId): boolean;
  b2Shape_EnablePreSolveEvents(shapeId: b2ShapeId, flag: boolean): void;
  b2Shape_ArePreSolveEventsEnabled(shapeId: b2ShapeId): boolean;
  b2Shape_EnableHitEvents(shapeId: b2ShapeId, flag: boolean): void;
  b2Shape_AreHitEventsEnabled(shapeId: b2ShapeId): boolean;
  b2Shape_GetParentChain(shapeId: b2ShapeId): b2ChainId;
  b2DestroyChain(chainId: b2ChainId): void;
  b2Chain_GetWorld(chainId: b2ChainId): b2WorldId;
  b2Chain_IsValid(id: b2ChainId): boolean;
  b2Chain_GetSegments(chainId: b2ChainId): b2ShapeIdVector;
  b2DestroyJoint(jointId: b2JointId): void;
  b2Joint_IsValid(id: b2JointId): boolean;
  b2Joint_GetType(jointId: b2JointId): b2JointType;
  b2Joint_GetBodyA(jointId: b2JointId): b2BodyId;
  b2Joint_GetBodyB(jointId: b2JointId): b2BodyId;
  b2Joint_GetWorld(jointId: b2JointId): b2WorldId;
  b2Joint_SetCollideConnected(jointId: b2JointId, shouldCollide: boolean): void;
  b2Joint_GetCollideConnected(jointId: b2JointId): boolean;
  b2Joint_WakeBodies(jointId: b2JointId): void;
  b2DistanceJoint_EnableSpring(jointId: b2JointId, enableSpring: boolean): void;
  b2DistanceJoint_IsSpringEnabled(jointId: b2JointId): boolean;
  b2DistanceJoint_EnableLimit(jointId: b2JointId, enableLimit: boolean): void;
  b2DistanceJoint_IsLimitEnabled(jointId: b2JointId): boolean;
  b2DistanceJoint_EnableMotor(jointId: b2JointId, enableMotor: boolean): void;
  b2DistanceJoint_IsMotorEnabled(jointId: b2JointId): boolean;
  b2PrismaticJoint_EnableSpring(jointId: b2JointId, enableSpring: boolean): void;
  b2PrismaticJoint_IsSpringEnabled(jointId: b2JointId): boolean;
  b2PrismaticJoint_EnableLimit(jointId: b2JointId, enableLimit: boolean): void;
  b2PrismaticJoint_IsLimitEnabled(jointId: b2JointId): boolean;
  b2PrismaticJoint_EnableMotor(jointId: b2JointId, enableMotor: boolean): void;
  b2PrismaticJoint_IsMotorEnabled(jointId: b2JointId): boolean;
  b2RevoluteJoint_EnableSpring(jointId: b2JointId, enableSpring: boolean): void;
  b2RevoluteJoint_IsSpringEnabled(jointId: b2JointId): boolean;
  b2RevoluteJoint_EnableLimit(jointId: b2JointId, enableLimit: boolean): void;
  b2RevoluteJoint_IsLimitEnabled(jointId: b2JointId): boolean;
  b2RevoluteJoint_EnableMotor(jointId: b2JointId, enableMotor: boolean): void;
  b2RevoluteJoint_IsMotorEnabled(jointId: b2JointId): boolean;
  b2WheelJoint_EnableSpring(jointId: b2JointId, enableSpring: boolean): void;
  b2WheelJoint_IsSpringEnabled(jointId: b2JointId): boolean;
  b2WheelJoint_EnableLimit(jointId: b2JointId, enableLimit: boolean): void;
  b2WheelJoint_IsLimitEnabled(jointId: b2JointId): boolean;
  b2WheelJoint_EnableMotor(jointId: b2JointId, enableMotor: boolean): void;
  b2WheelJoint_IsMotorEnabled(jointId: b2JointId): boolean;
  b2World_GetMaxCapacity(worldId: b2WorldId): b2Capacity;
  b2MinInt(a: number, b: number): number;
  b2MaxInt(a: number, b: number): number;
  b2AbsInt(a: number): number;
  b2ClampInt(a: number, lower: number, upper: number): number;
  b2CeilingInt(numerator: number, denominator: number): number;
  b2GetGraphColor(index: number): b2HexColor;
  b2World_SetRestitutionIterations(worldId: b2WorldId, iterations: number): void;
  b2World_GetRestitutionIterations(worldId: b2WorldId): number;
  b2World_GetAwakeBodyCount(worldId: b2WorldId): number;
  b2World_SetWorkerCount(worldId: b2WorldId, count: number): void;
  b2World_GetWorkerCount(worldId: b2WorldId): number;
  b2Body_GetShapeCount(bodyId: b2BodyId): number;
  b2Body_GetJointCount(bodyId: b2BodyId): number;
  b2Body_GetContactCapacity(bodyId: b2BodyId): number;
  b2Shape_GetContactCapacity(shapeId: b2ShapeId): number;
  b2Shape_GetSensorCapacity(shapeId: b2ShapeId): number;
  b2Chain_GetSegmentCount(chainId: b2ChainId): number;
  b2CreateDynamicTree(proxyCapacity: number): b2DynamicTree | null;
  b2DestroyTreeProxy(tree: b2DynamicTree | null, proxyId: number): void;
  b2DynamicTree_GetHeight(tree: b2DynamicTree | null): number;
  b2DynamicTree_GetProxyCount(tree: b2DynamicTree | null): number;
  b2DynamicTree_GetByteCount(tree: b2DynamicTree | null): number;
  b2Contact_IsValid(id: b2ContactId): boolean;
  b2StoreWorldId(id: b2WorldId): number;
  b2LoadWorldId(x: number): b2WorldId;
  b2World_GetBounds(out: b2AABB, worldId: b2WorldId): b2AABB;
  b2World_GetGravity(out: b2Vec2, worldId: b2WorldId): b2Vec2;
  b2Body_GetPosition(out: b2Vec2, bodyId: b2BodyId): b2Vec2;
  b2Body_GetRotation(out: b2Rot, bodyId: b2BodyId): b2Rot;
  b2Body_GetTransform(outPosition: b2Vec2, outRotation: b2Rot, bodyId: b2BodyId): [ b2Vec2, b2Rot ];
  b2Body_GetLinearVelocity(out: b2Vec2, bodyId: b2BodyId): b2Vec2;
  b2Body_GetLocalCenter(out: b2Vec2, bodyId: b2BodyId): b2Vec2;
  b2Body_GetWorldCenter(out: b2Vec2, bodyId: b2BodyId): b2Vec2;
  b2Body_ComputeAABB(out: b2AABB, bodyId: b2BodyId): b2AABB;
  b2Shape_GetAABB(out: b2AABB, shapeId: b2ShapeId): b2AABB;
  b2Joint_GetLocalFrameA(outPosition: b2Vec2, outRotation: b2Rot, jointId: b2JointId): [ b2Vec2, b2Rot ];
  b2Joint_GetLocalFrameB(outPosition: b2Vec2, outRotation: b2Rot, jointId: b2JointId): [ b2Vec2, b2Rot ];
  b2Joint_GetConstraintForce(out: b2Vec2, jointId: b2JointId): b2Vec2;
  b2MotorJoint_GetLinearVelocity(out: b2Vec2, jointId: b2JointId): b2Vec2;
  b2MoverJoint_GetLinearVelocity(out: b2Vec2, jointId: b2JointId): b2Vec2;
  b2MoverJoint_GetMaxVelocityForce(out: b2Vec2, jointId: b2JointId): b2Vec2;
  b2World_SetUserData(worldId: b2WorldId, userData: number): void;
  b2World_GetUserData(worldId: b2WorldId): number;
  b2CreateRecording(byteCapacity: number): number;
  b2DestroyRecording(recording: number): void;
  b2Recording_GetSize(recording: number): number;
  b2World_StartRecording(worldId: b2WorldId, recording: number): void;
  b2Body_SetUserData(bodyId: b2BodyId, userData: number): void;
  b2Body_GetUserData(bodyId: b2BodyId): number;
  b2Shape_SetUserData(shapeId: b2ShapeId, userData: number): void;
  b2Shape_GetUserData(shapeId: b2ShapeId): number;
  b2Joint_SetUserData(jointId: b2JointId, userData: number): void;
  b2Joint_GetUserData(jointId: b2JointId): number;
  b2DestroyReplay(player: number): void;
  b2Replay_StepFrame(player: number): boolean;
  b2Replay_GetWorldId(player: number): b2WorldId;
  b2Replay_Restart(player: number): void;
  b2Replay_SeekFrame(player: number, targetFrame: number): void;
  b2Replay_GetFrame(player: number): number;
  b2Replay_IsAtEnd(player: number): boolean;
  b2Replay_HasDiverged(player: number): boolean;
  b2Replay_GetDivergeFrame(player: number): number;
  b2Replay_SetKeyframePolicy(player: number, budgetBytes: number, minIntervalFrames: number): void;
  b2Replay_GetKeyframeBudget(player: number): number;
  b2Replay_GetKeyframeMinInterval(player: number): number;
  b2Replay_GetKeyframeInterval(player: number): number;
  b2Replay_GetKeyframeBytes(player: number): number;
  b2Replay_GetFrameQueryCount(player: number): number;
  b2Replay_GetBodyCount(player: number): number;
  b2Replay_GetBodyId(player: number, index: number): b2BodyId;
  b2GetByteCount(): bigint;
  b2DefaultFilter(): b2Filter;
  b2Shape_GetFilter(shapeId: b2ShapeId): b2Filter;
  b2Shape_SetFilter(shapeId: b2ShapeId, filter: b2Filter): void;
  b2DefaultQueryFilter(): b2QueryFilter;
  b2GetTicks(): bigint;
  b2StoreBodyId(id: b2BodyId): bigint;
  b2LoadBodyId(x: bigint): b2BodyId;
  b2StoreShapeId(id: b2ShapeId): bigint;
  b2LoadShapeId(x: bigint): b2ShapeId;
  b2StoreChainId(id: b2ChainId): bigint;
  b2LoadChainId(x: bigint): b2ChainId;
  b2StoreJointId(id: b2JointId): bigint;
  b2LoadJointId(x: bigint): b2JointId;
  b2World_GetStateHash(worldId: b2WorldId): bigint;
  b2Shape_SetUserMaterial(shapeId: b2ShapeId, material: bigint): void;
  b2Shape_GetUserMaterial(shapeId: b2ShapeId): bigint;
  b2DynamicTree_SetCategoryBits(tree: b2DynamicTree | null, proxyId: number, categoryBits: bigint): void;
  b2DynamicTree_GetCategoryBits(tree: b2DynamicTree | null, proxyId: number): bigint;
  b2DynamicTree_GetUserData(tree: b2DynamicTree | null, proxyId: number): bigint;
  b2GetInverse22(A: b2Mat22): b2Mat22;
  b2Shape_GetSegment(shapeId: b2ShapeId): b2Segment;
  b2Shape_SetSegment(shapeId: b2ShapeId, segment: b2Segment): void;
  b2Shape_GetChainSegment(shapeId: b2ShapeId): b2ChainSegment;
  b2Shape_SetChainSegment(shapeId: b2ShapeId, chainSegment: b2ChainSegment): void;
  b2DefaultChainDef(): b2ChainDef;
  b2IsValidVec2(v: b2Vec2): boolean;
  b2IsValidPosition(p: b2Vec2): boolean;
  b2LeftPerp(v: b2Vec2): b2Vec2;
  b2RightPerp(v: b2Vec2): b2Vec2;
  b2Add(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Sub(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Neg(a: b2Vec2): b2Vec2;
  b2Mul(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Abs(a: b2Vec2): b2Vec2;
  b2Min(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Max(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Clamp(v: b2Vec2, a: b2Vec2, b: b2Vec2): b2Vec2;
  b2Normalize(a: b2Vec2): b2Vec2;
  b2IsNormalized(a: b2Vec2): boolean;
  b2ToPos(v: b2Vec2): b2Vec2;
  b2ToVec2(p: b2Vec2): b2Vec2;
  b2SubPos(a: b2Vec2, b: b2Vec2): b2Vec2;
  b2OffsetPos(p: b2Vec2, d: b2Vec2): b2Vec2;
  b2MulMV(A: b2Mat22, v: b2Vec2): b2Vec2;
  b2Solve22(A: b2Mat22, b: b2Vec2): b2Vec2;
  b2World_SetGravity(worldId: b2WorldId, gravity: b2Vec2): void;
  b2Body_GetLocalPoint(out: b2Vec2, bodyId: b2BodyId, worldPoint: b2Vec2): b2Vec2;
  b2Body_GetWorldPoint(out: b2Vec2, bodyId: b2BodyId, localPoint: b2Vec2): b2Vec2;
  b2Body_GetLocalVector(out: b2Vec2, bodyId: b2BodyId, worldVector: b2Vec2): b2Vec2;
  b2Body_GetWorldVector(out: b2Vec2, bodyId: b2BodyId, localVector: b2Vec2): b2Vec2;
  b2Body_SetLinearVelocity(bodyId: b2BodyId, linearVelocity: b2Vec2): void;
  b2Body_GetLocalPointVelocity(out: b2Vec2, bodyId: b2BodyId, localPoint: b2Vec2): b2Vec2;
  b2Body_GetWorldPointVelocity(out: b2Vec2, bodyId: b2BodyId, worldPoint: b2Vec2): b2Vec2;
  b2Body_ApplyForce(bodyId: b2BodyId, force: b2Vec2, point: b2Vec2, wake: boolean): void;
  b2Body_ApplyForceToCenter(bodyId: b2BodyId, force: b2Vec2, wake: boolean): void;
  b2Body_ApplyLinearImpulse(bodyId: b2BodyId, impulse: b2Vec2, point: b2Vec2, wake: boolean): void;
  b2Body_ApplyLinearImpulseToCenter(bodyId: b2BodyId, impulse: b2Vec2, wake: boolean): void;
  b2Shape_TestPoint(shapeId: b2ShapeId, point: b2Vec2): boolean;
  b2Shape_GetClosestPoint(out: b2Vec2, shapeId: b2ShapeId, target: b2Vec2): b2Vec2;
  b2MotorJoint_SetLinearVelocity(jointId: b2JointId, velocity: b2Vec2): void;
  b2MoverJoint_SetLinearVelocity(jointId: b2JointId, velocity: b2Vec2): void;
  b2MoverJoint_SetMaxVelocityForce(jointId: b2JointId, maxForce: b2Vec2): void;
  b2IsValidTransform(t: b2Transform): boolean;
  b2IsValidWorldTransform(t: b2Transform): boolean;
  b2TransformPoint(t: b2Transform, p: b2Vec2): b2Vec2;
  b2InvTransformPoint(t: b2Transform, p: b2Vec2): b2Vec2;
  b2MulTransforms(A: b2Transform, B: b2Transform): b2Transform;
  b2InvMulTransforms(A: b2Transform, B: b2Transform): b2Transform;
  b2TransformWorldPoint(t: b2Transform, p: b2Vec2): b2Vec2;
  b2InvTransformWorldPoint(t: b2Transform, p: b2Vec2): b2Vec2;
  b2InvMulWorldTransforms(A: b2Transform, B: b2Transform): b2Transform;
  b2MulWorldTransforms(A: b2Transform, B: b2Transform): b2Transform;
  b2ToRelativeTransform(t: b2Transform, base: b2Vec2): b2Transform;
  b2MakeWorldTransform(t: b2Transform): b2Transform;
  b2Joint_SetLocalFrameA(jointId: b2JointId, localFrame: b2Transform): void;
  b2Joint_SetLocalFrameB(jointId: b2JointId, localFrame: b2Transform): void;
  b2IsValidRotation(q: b2Rot): boolean;
  b2NormalizeRot(q: b2Rot): b2Rot;
  b2MakeRotFromUnitVector(unitVector: b2Vec2): b2Rot;
  b2ComputeRotationBetweenUnitVectors(v1: b2Vec2, v2: b2Vec2): b2Rot;
  b2IsNormalizedRot(q: b2Rot): boolean;
  b2InvertRot(a: b2Rot): b2Rot;
  b2Rot_GetXAxis(q: b2Rot): b2Vec2;
  b2Rot_GetYAxis(q: b2Rot): b2Vec2;
  b2MulRot(q: b2Rot, r: b2Rot): b2Rot;
  b2InvMulRot(a: b2Rot, b: b2Rot): b2Rot;
  b2RotateVector(q: b2Rot, v: b2Vec2): b2Vec2;
  b2InvRotateVector(q: b2Rot, v: b2Vec2): b2Vec2;
  b2Body_SetTransform(bodyId: b2BodyId, position: b2Vec2, rotation: b2Rot): void;
  b2Replay_GetFrameQuery(player: number, index: number): b2ReplayQueryInfo;
  b2IsValidAABB(aabb: b2AABB): boolean;
  b2AABB_Contains(a: b2AABB, b: b2AABB): boolean;
  b2AABB_Center(a: b2AABB): b2Vec2;
  b2AABB_Extents(a: b2AABB): b2Vec2;
  b2AABB_Union(a: b2AABB, b: b2AABB): b2AABB;
  b2AABB_Overlaps(a: b2AABB, b: b2AABB): boolean;
  b2ComputeSegmentAABB(shape: b2Segment, transform: b2Transform): b2AABB;
  b2CreateTreeProxy(tree: b2DynamicTree | null, aabb: b2AABB, categoryBits: bigint, userData: bigint): number;
  b2DynamicTree_MoveProxy(tree: b2DynamicTree | null, proxyId: number, aabb: b2AABB): void;
  b2DynamicTree_GetRootBounds(tree: b2DynamicTree | null): b2AABB;
  b2DynamicTree_GetAABB(tree: b2DynamicTree | null, proxyId: number): b2AABB;
  b2IsValidPlane(a: b2Plane): boolean;
  b2IsValidRay(input: b2RayCastInput): boolean;
  b2RayCastSegment(shape: b2Segment, input: b2RayCastInput, oneSided: boolean): b2CastOutput;
  b2Shape_RayCast(shapeId: b2ShapeId, origin: b2Vec2, translation: b2Vec2): b2CastOutput;
  b2Body_SetMassData(bodyId: b2BodyId, massData: b2MassData): void;
  b2Body_GetMassData(bodyId: b2BodyId): b2MassData;
  b2Shape_ComputeMassData(shapeId: b2ShapeId): b2MassData;
  b2ComputeCircleAABB(shape: b2Circle, transform: b2Transform): b2AABB;
  b2PointInCircle(shape: b2Circle, point: b2Vec2): boolean;
  b2RayCastCircle(shape: b2Circle, input: b2RayCastInput): b2CastOutput;
  b2Shape_GetCircle(shapeId: b2ShapeId): b2Circle;
  b2Shape_SetCircle(shapeId: b2ShapeId, circle: b2Circle): void;
  b2ComputeCapsuleAABB(shape: b2Capsule, transform: b2Transform): b2AABB;
  b2PointInCapsule(shape: b2Capsule, point: b2Vec2): boolean;
  b2RayCastCapsule(shape: b2Capsule, input: b2RayCastInput): b2CastOutput;
  b2Shape_GetCapsule(shapeId: b2ShapeId): b2Capsule;
  b2Shape_SetCapsule(shapeId: b2ShapeId, capsule: b2Capsule): void;
  b2SegmentDistance(p1: b2Vec2, q1: b2Vec2, p2: b2Vec2, q2: b2Vec2): b2SegmentDistanceResult;
  b2World_CastRayClosest(worldId: b2WorldId, origin: b2Vec2, translation: b2Vec2, filter: b2QueryFilter): b2RayResult;
  b2DefaultWorldDef(): b2WorldDef;
  b2DefaultBodyDef(): b2BodyDef;
  b2DefaultSurfaceMaterial(): b2SurfaceMaterial;
  b2Shape_SetSurfaceMaterial(shapeId: b2ShapeId, surfaceMaterial: b2SurfaceMaterial): void;
  b2Shape_GetSurfaceMaterial(shapeId: b2ShapeId): b2SurfaceMaterial;
  b2Chain_SetAllSurfaceMaterials(chainId: b2ChainId, material: b2SurfaceMaterial): void;
  b2Chain_SetSurfaceMaterial(chainId: b2ChainId, material: b2SurfaceMaterial, segmentIndex: number): void;
  b2Chain_GetSurfaceMaterial(chainId: b2ChainId, segmentIndex: number): b2SurfaceMaterial;
  b2DefaultShapeDef(): b2ShapeDef;
  b2CreateCircleShape(bodyId: b2BodyId, def: b2ShapeDef, circle: b2Circle): b2ShapeId;
  b2CreateSegmentShape(bodyId: b2BodyId, def: b2ShapeDef, segment: b2Segment): b2ShapeId;
  b2CreateChainSegmentShape(bodyId: b2BodyId, def: b2ShapeDef, chainSegment: b2ChainSegment): b2ShapeId;
  b2CreateCapsuleShape(bodyId: b2BodyId, def: b2ShapeDef, capsule: b2Capsule): b2ShapeId;
  b2World_GetProfile(worldId: b2WorldId): b2Profile;
  b2DefaultFilterJointDef(): b2FilterJointDef;
  b2CreateFilterJoint(worldId: b2WorldId, def: b2FilterJointDef): b2JointId;
  b2DefaultMoverJointDef(): b2MoverJointDef;
  b2CreateMoverJoint(worldId: b2WorldId, def: b2MoverJointDef): b2JointId;
  b2DefaultDistanceJointDef(): b2DistanceJointDef;
  b2CreateDistanceJoint(worldId: b2WorldId, def: b2DistanceJointDef): b2JointId;
  b2DefaultMotorJointDef(): b2MotorJointDef;
  b2CreateMotorJoint(worldId: b2WorldId, def: b2MotorJointDef): b2JointId;
  b2DefaultPogoJointDef(): b2PogoJointDef;
  b2CreatePogoJoint(worldId: b2WorldId, def: b2PogoJointDef): b2JointId;
  b2DefaultPrismaticJointDef(): b2PrismaticJointDef;
  b2CreatePrismaticJoint(worldId: b2WorldId, def: b2PrismaticJointDef): b2JointId;
  b2DefaultRevoluteJointDef(): b2RevoluteJointDef;
  b2CreateRevoluteJoint(worldId: b2WorldId, def: b2RevoluteJointDef): b2JointId;
  b2DefaultWeldJointDef(): b2WeldJointDef;
  b2CreateWeldJoint(worldId: b2WorldId, def: b2WeldJointDef): b2JointId;
  b2DefaultWheelJointDef(): b2WheelJointDef;
  b2CreateWheelJoint(worldId: b2WorldId, def: b2WheelJointDef): b2JointId;
  b2DefaultExplosionDef(): b2ExplosionDef;
  b2World_Explode(worldId: b2WorldId, explosionDef: b2ExplosionDef): void;
  b2DefaultDebugDraw(): b2DebugDraw;
  b2Replay_GetInfo(player: number): b2ReplayInfo;
  b2Replay_GetFrameQueryHit(player: number, queryIndex: number, hitIndex: number): b2ReplayQueryHit;
  b2GetMilliseconds(ticks: bigint): number;
  b2IsValidFloat(a: number): boolean;
  b2MinFloat(a: number, b: number): number;
  b2MaxFloat(a: number, b: number): number;
  b2AbsFloat(a: number): number;
  b2ClampFloat(a: number, lower: number, upper: number): number;
  b2Atan2(y: number, x: number): number;
  b2ComputeCosSin(radians: number): b2CosSin;
  b2Dot(a: b2Vec2, b: b2Vec2): number;
  b2Cross(a: b2Vec2, b: b2Vec2): number;
  b2CrossVS(v: b2Vec2, s: number): b2Vec2;
  b2CrossSV(s: number, v: b2Vec2): b2Vec2;
  b2Lerp(a: b2Vec2, b: b2Vec2, t: number): b2Vec2;
  b2MulSV(s: number, v: b2Vec2): b2Vec2;
  b2MulAdd(a: b2Vec2, s: number, b: b2Vec2): b2Vec2;
  b2MulSub(a: b2Vec2, s: number, b: b2Vec2): b2Vec2;
  b2Length(v: b2Vec2): number;
  b2Distance(a: b2Vec2, b: b2Vec2): number;
  b2IntegrateRotation(q1: b2Rot, deltaAngle: number): b2Rot;
  b2LengthSquared(v: b2Vec2): number;
  b2DistanceSquared(a: b2Vec2, b: b2Vec2): number;
  b2MakeRot(radians: number): b2Rot;
  b2NLerp(q1: b2Rot, q2: b2Rot, t: number): b2Rot;
  b2ComputeAngularVelocity(q1: b2Rot, q2: b2Rot, inv_h: number): number;
  b2Rot_GetAngle(q: b2Rot): number;
  b2RelativeAngle(a: b2Rot, b: b2Rot): number;
  b2UnwindAngle(radians: number): number;
  b2LerpPosition(a: b2Vec2, b: b2Vec2, t: number): b2Vec2;
  b2PlaneSeparation(plane: b2Plane, point: b2Vec2): number;
  b2SpringDamper(hertz: number, dampingRatio: number, position: number, velocity: number, timeStep: number): number;
  b2SetLengthUnitsPerMeter(lengthUnits: number): void;
  b2GetLengthUnitsPerMeter(): number;
  b2ComputeCircleMass(shape: b2Circle, density: number): b2MassData;
  b2ComputeCapsuleMass(shape: b2Capsule, density: number): b2MassData;
  b2GetSweepTransform(sweep: b2Sweep, time: number): b2Transform;
  b2World_Step(worldId: b2WorldId, timeStep: number, subStepCount: number): void;
  b2World_CastMover(worldId: b2WorldId, origin: b2Vec2, mover: b2Capsule, translation: b2Vec2, filter: b2QueryFilter): number;
  b2World_SetRestitutionThreshold(worldId: b2WorldId, value: number): void;
  b2World_GetRestitutionThreshold(worldId: b2WorldId): number;
  b2World_SetHitEventThreshold(worldId: b2WorldId, value: number): void;
  b2World_GetHitEventThreshold(worldId: b2WorldId): number;
  b2World_SetContactTuning(worldId: b2WorldId, hertz: number, dampingRatio: number, pushSpeed: number): void;
  b2World_SetContactRecycleDistance(worldId: b2WorldId, recycleDistance: number): void;
  b2World_GetContactRecycleDistance(worldId: b2WorldId): number;
  b2World_SetMaximumLinearSpeed(worldId: b2WorldId, maximumLinearSpeed: number): void;
  b2World_GetMaximumLinearSpeed(worldId: b2WorldId): number;
  b2Body_GetAngularVelocity(bodyId: b2BodyId): number;
  b2Body_SetAngularVelocity(bodyId: b2BodyId, angularVelocity: number): void;
  b2Body_SetTargetTransform(bodyId: b2BodyId, target: b2Transform, timeStep: number, wake: boolean): void;
  b2Body_ApplyTorque(bodyId: b2BodyId, torque: number, wake: boolean): void;
  b2Body_ApplyAngularImpulse(bodyId: b2BodyId, impulse: number, wake: boolean): void;
  b2Body_GetMass(bodyId: b2BodyId): number;
  b2Body_GetRotationalInertia(bodyId: b2BodyId): number;
  b2Body_SetLinearDamping(bodyId: b2BodyId, linearDamping: number): void;
  b2Body_GetLinearDamping(bodyId: b2BodyId): number;
  b2Body_SetAngularDamping(bodyId: b2BodyId, angularDamping: number): void;
  b2Body_GetAngularDamping(bodyId: b2BodyId): number;
  b2Body_SetGravityScale(bodyId: b2BodyId, gravityScale: number): void;
  b2Body_GetGravityScale(bodyId: b2BodyId): number;
  b2Body_SetSleepThreshold(bodyId: b2BodyId, sleepThreshold: number): void;
  b2Body_GetSleepThreshold(bodyId: b2BodyId): number;
  b2Body_SetSafetyFactor(bodyId: b2BodyId, safetyFactor: number): void;
  b2Body_GetSafetyFactor(bodyId: b2BodyId): number;
  b2Body_GetMinExtent(bodyId: b2BodyId): number;
  b2Body_GetMaxExtent(bodyId: b2BodyId): number;
  b2Body_GetMaxExtentOrigin(bodyId: b2BodyId): number;
  b2Shape_SetDensity(shapeId: b2ShapeId, density: number, updateBodyMass: boolean): void;
  b2Shape_GetDensity(shapeId: b2ShapeId): number;
  b2Shape_SetFriction(shapeId: b2ShapeId, friction: number): void;
  b2Shape_GetFriction(shapeId: b2ShapeId): number;
  b2Shape_SetRestitution(shapeId: b2ShapeId, restitution: number): void;
  b2Shape_GetRestitution(shapeId: b2ShapeId): number;
  b2Shape_ApplyWind(shapeId: b2ShapeId, wind: b2Vec2, drag: number, lift: number, wake: boolean): void;
  b2Joint_GetConstraintTorque(jointId: b2JointId): number;
  b2Joint_GetLinearSeparation(jointId: b2JointId): number;
  b2Joint_GetAngularSeparation(jointId: b2JointId): number;
  b2Joint_SetConstraintTuning(jointId: b2JointId, hertz: number, dampingRatio: number): void;
  b2Joint_SetForceThreshold(jointId: b2JointId, threshold: number): void;
  b2Joint_GetForceThreshold(jointId: b2JointId): number;
  b2Joint_SetTorqueThreshold(jointId: b2JointId, threshold: number): void;
  b2Joint_GetTorqueThreshold(jointId: b2JointId): number;
  b2DistanceJoint_SetLength(jointId: b2JointId, length: number): void;
  b2DistanceJoint_GetLength(jointId: b2JointId): number;
  b2DistanceJoint_SetSpringForceRange(jointId: b2JointId, lowerForce: number, upperForce: number): void;
  b2DistanceJoint_SetSpringHertz(jointId: b2JointId, hertz: number): void;
  b2DistanceJoint_SetSpringDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2DistanceJoint_GetSpringHertz(jointId: b2JointId): number;
  b2DistanceJoint_GetSpringDampingRatio(jointId: b2JointId): number;
  b2DistanceJoint_GetSpringForce(jointId: b2JointId): number;
  b2DistanceJoint_SetLengthRange(jointId: b2JointId, minLength: number, maxLength: number): void;
  b2DistanceJoint_GetMinLength(jointId: b2JointId): number;
  b2DistanceJoint_GetMaxLength(jointId: b2JointId): number;
  b2DistanceJoint_GetCurrentLength(jointId: b2JointId): number;
  b2DistanceJoint_SetMotorSpeed(jointId: b2JointId, motorSpeed: number): void;
  b2DistanceJoint_GetMotorSpeed(jointId: b2JointId): number;
  b2DistanceJoint_SetMaxMotorForce(jointId: b2JointId, force: number): void;
  b2DistanceJoint_GetMaxMotorForce(jointId: b2JointId): number;
  b2DistanceJoint_GetMotorForce(jointId: b2JointId): number;
  b2MotorJoint_SetAngularVelocity(jointId: b2JointId, velocity: number): void;
  b2MotorJoint_GetAngularVelocity(jointId: b2JointId): number;
  b2MotorJoint_SetMaxVelocityForce(jointId: b2JointId, maxForce: number): void;
  b2MotorJoint_GetMaxVelocityForce(jointId: b2JointId): number;
  b2MotorJoint_SetMaxVelocityTorque(jointId: b2JointId, maxTorque: number): void;
  b2MotorJoint_GetMaxVelocityTorque(jointId: b2JointId): number;
  b2MotorJoint_SetLinearHertz(jointId: b2JointId, hertz: number): void;
  b2MotorJoint_GetLinearHertz(jointId: b2JointId): number;
  b2MotorJoint_SetLinearDampingRatio(jointId: b2JointId, damping: number): void;
  b2MotorJoint_GetLinearDampingRatio(jointId: b2JointId): number;
  b2MotorJoint_SetAngularHertz(jointId: b2JointId, hertz: number): void;
  b2MotorJoint_GetAngularHertz(jointId: b2JointId): number;
  b2MotorJoint_SetAngularDampingRatio(jointId: b2JointId, damping: number): void;
  b2MotorJoint_GetAngularDampingRatio(jointId: b2JointId): number;
  b2MotorJoint_SetMaxSpringForce(jointId: b2JointId, maxForce: number): void;
  b2MotorJoint_GetMaxSpringForce(jointId: b2JointId): number;
  b2MotorJoint_SetMaxSpringTorque(jointId: b2JointId, maxTorque: number): void;
  b2MotorJoint_GetMaxSpringTorque(jointId: b2JointId): number;
  b2PogoJoint_SetRestLength(jointId: b2JointId, length: number): void;
  b2PogoJoint_GetRestLength(jointId: b2JointId): number;
  b2PogoJoint_SetSpringHertz(jointId: b2JointId, hertz: number): void;
  b2PogoJoint_GetSpringHertz(jointId: b2JointId): number;
  b2PogoJoint_SetSpringDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2PogoJoint_GetSpringDampingRatio(jointId: b2JointId): number;
  b2PogoJoint_GetLength(jointId: b2JointId): number;
  b2PogoJoint_GetVelocity(jointId: b2JointId): number;
  b2PogoJoint_GetImpulse(jointId: b2JointId): number;
  b2PrismaticJoint_SetSpringHertz(jointId: b2JointId, hertz: number): void;
  b2PrismaticJoint_GetSpringHertz(jointId: b2JointId): number;
  b2PrismaticJoint_SetSpringDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2PrismaticJoint_GetSpringDampingRatio(jointId: b2JointId): number;
  b2PrismaticJoint_SetTargetTranslation(jointId: b2JointId, translation: number): void;
  b2PrismaticJoint_GetTargetTranslation(jointId: b2JointId): number;
  b2PrismaticJoint_GetLowerLimit(jointId: b2JointId): number;
  b2PrismaticJoint_GetUpperLimit(jointId: b2JointId): number;
  b2PrismaticJoint_SetLimits(jointId: b2JointId, lower: number, upper: number): void;
  b2PrismaticJoint_SetMotorSpeed(jointId: b2JointId, motorSpeed: number): void;
  b2PrismaticJoint_GetMotorSpeed(jointId: b2JointId): number;
  b2PrismaticJoint_SetMaxMotorForce(jointId: b2JointId, force: number): void;
  b2PrismaticJoint_GetMaxMotorForce(jointId: b2JointId): number;
  b2PrismaticJoint_GetMotorForce(jointId: b2JointId): number;
  b2PrismaticJoint_GetTranslation(jointId: b2JointId): number;
  b2PrismaticJoint_GetSpeed(jointId: b2JointId): number;
  b2RevoluteJoint_SetSpringHertz(jointId: b2JointId, hertz: number): void;
  b2RevoluteJoint_GetSpringHertz(jointId: b2JointId): number;
  b2RevoluteJoint_SetSpringDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2RevoluteJoint_GetSpringDampingRatio(jointId: b2JointId): number;
  b2RevoluteJoint_SetTargetAngle(jointId: b2JointId, angle: number): void;
  b2RevoluteJoint_GetTargetAngle(jointId: b2JointId): number;
  b2RevoluteJoint_GetAngle(jointId: b2JointId): number;
  b2RevoluteJoint_GetLowerLimit(jointId: b2JointId): number;
  b2RevoluteJoint_GetUpperLimit(jointId: b2JointId): number;
  b2RevoluteJoint_SetLimits(jointId: b2JointId, lower: number, upper: number): void;
  b2RevoluteJoint_SetMotorSpeed(jointId: b2JointId, motorSpeed: number): void;
  b2RevoluteJoint_GetMotorSpeed(jointId: b2JointId): number;
  b2RevoluteJoint_GetMotorTorque(jointId: b2JointId): number;
  b2RevoluteJoint_SetMaxMotorTorque(jointId: b2JointId, torque: number): void;
  b2RevoluteJoint_GetMaxMotorTorque(jointId: b2JointId): number;
  b2WeldJoint_SetLinearHertz(jointId: b2JointId, hertz: number): void;
  b2WeldJoint_GetLinearHertz(jointId: b2JointId): number;
  b2WeldJoint_SetLinearDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2WeldJoint_GetLinearDampingRatio(jointId: b2JointId): number;
  b2WeldJoint_SetAngularHertz(jointId: b2JointId, hertz: number): void;
  b2WeldJoint_GetAngularHertz(jointId: b2JointId): number;
  b2WeldJoint_SetAngularDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2WeldJoint_GetAngularDampingRatio(jointId: b2JointId): number;
  b2WheelJoint_SetSpringHertz(jointId: b2JointId, hertz: number): void;
  b2WheelJoint_GetSpringHertz(jointId: b2JointId): number;
  b2WheelJoint_SetSpringDampingRatio(jointId: b2JointId, dampingRatio: number): void;
  b2WheelJoint_GetSpringDampingRatio(jointId: b2JointId): number;
  b2WheelJoint_GetLowerLimit(jointId: b2JointId): number;
  b2WheelJoint_GetUpperLimit(jointId: b2JointId): number;
  b2WheelJoint_SetLimits(jointId: b2JointId, lower: number, upper: number): void;
  b2WheelJoint_SetMotorSpeed(jointId: b2JointId, motorSpeed: number): void;
  b2WheelJoint_GetMotorSpeed(jointId: b2JointId): number;
  b2WheelJoint_SetMaxMotorTorque(jointId: b2JointId, torque: number): void;
  b2WheelJoint_GetMaxMotorTorque(jointId: b2JointId): number;
  b2WheelJoint_GetMotorTorque(jointId: b2JointId): number;
  b2DynamicTree_GetAreaRatio(tree: b2DynamicTree | null): number;
  b2RoundDownFloat(x: number): number;
  b2RoundUpFloat(x: number): number;
  b2Body_SetName(bodyId: b2BodyId, name: EmbindString): void;
  b2Body_GetName(bodyId: b2BodyId): string;
  b2ShapeCastCircle(shape: b2Circle, input: b2ShapeCastInput): b2CastOutput;
  b2ShapeCastCapsule(shape: b2Capsule, input: b2ShapeCastInput): b2CastOutput;
  b2ShapeCastSegment(shape: b2Segment, input: b2ShapeCastInput): b2CastOutput;
  b2ShapeCast(input: b2ShapeCastPairInput): b2CastOutput;
  b2TimeOfImpact(input: b2TOIInput): b2TOIOutput;
  b2MakeSquare(halfWidth: number): b2Polygon;
  b2MakeBox(halfWidth: number, halfHeight: number): b2Polygon;
  b2MakeRoundedBox(halfWidth: number, halfHeight: number, radius: number): b2Polygon;
  b2MakeOffsetBox(halfWidth: number, halfHeight: number, center: b2Vec2, rotation: b2Rot): b2Polygon;
  b2MakeOffsetRoundedBox(halfWidth: number, halfHeight: number, center: b2Vec2, rotation: b2Rot, radius: number): b2Polygon;
  b2TransformPolygon(transform: b2Transform, polygon: b2Polygon): b2Polygon;
  b2ComputePolygonMass(shape: b2Polygon, density: number): b2MassData;
  b2ComputePolygonAABB(shape: b2Polygon, transform: b2Transform): b2AABB;
  b2PointInPolygon(shape: b2Polygon, point: b2Vec2): boolean;
  b2RayCastPolygon(shape: b2Polygon, input: b2RayCastInput): b2CastOutput;
  b2ShapeCastPolygon(shape: b2Polygon, input: b2ShapeCastInput): b2CastOutput;
  b2CreatePolygonShape(bodyId: b2BodyId, def: b2ShapeDef, polygon: b2Polygon): b2ShapeId;
  b2Shape_GetPolygon(shapeId: b2ShapeId): b2Polygon;
  b2Shape_SetPolygon(shapeId: b2ShapeId, polygon: b2Polygon): void;
  b2MakePolygon(hull: b2Hull, radius: number): b2Polygon;
  b2MakeOffsetPolygon(hull: b2Hull, position: b2Vec2, rotation: b2Rot): b2Polygon;
  b2MakeOffsetRoundedPolygon(hull: b2Hull, position: b2Vec2, rotation: b2Rot, radius: number): b2Polygon;
  b2ValidateHull(hull: b2Hull): boolean;
  b2Contact_GetData(contactId: b2ContactId): b2ContactData;
  b2CollideCircles(circleA: b2Circle, circleB: b2Circle, xf: b2Transform): b2LocalManifold;
  b2CollideCapsuleAndCircle(capsuleA: b2Capsule, circleB: b2Circle, xf: b2Transform): b2LocalManifold;
  b2CollideSegmentAndCircle(segmentA: b2Segment, circleB: b2Circle, xf: b2Transform): b2LocalManifold;
  b2CollidePolygonAndCircle(polygonA: b2Polygon, circleB: b2Circle, xf: b2Transform): b2LocalManifold;
  b2CollideCapsules(capsuleA: b2Capsule, capsuleB: b2Capsule, xf: b2Transform): b2LocalManifold;
  b2CollideSegmentAndCapsule(segmentA: b2Segment, capsuleB: b2Capsule, xf: b2Transform): b2LocalManifold;
  b2CollidePolygonAndCapsule(polygonA: b2Polygon, capsuleB: b2Capsule, xf: b2Transform): b2LocalManifold;
  b2CollidePolygons(polygonA: b2Polygon, polygonB: b2Polygon, xf: b2Transform): b2LocalManifold;
  b2CollideSegmentAndPolygon(segmentA: b2Segment, polygonB: b2Polygon, xf: b2Transform): b2LocalManifold;
  b2CollideChainSegmentAndCircle(segmentA: b2ChainSegment, circleB: b2Circle, xf: b2Transform): b2LocalManifold;
  b2World_GetCounters(worldId: b2WorldId): b2Counters;
  b2SetAllocator(allocFcn: ((size: number, alignment: number) => number) | null, freeFcn: ((mem: number, size: number) => void) | null): void;
  b2SetAssertFcn(assertFcn: (condition: string, fileName: string, lineNumber: number) => number): void;
  b2SetLogFcn(logFcn: (message: string) => void): void;
  b2GetMillisecondsAndReset(ticks: bigint): { milliseconds: number, ticks: bigint };
  b2Hash(hash: number, data: ArrayLike<number>): number;
  b2GetLengthAndNormalize(a: b2Vec2): { length: number, normalized: b2Vec2 };
  b2MakeAABB(points: ArrayLike<number>, radius: number): b2AABB;
  b2StoreContactId(id: b2ContactId): [ number, number, number ];
  b2LoadContactId(values: [ number, number, number ]): b2ContactId;
  b2ComputeHull(points: ArrayLike<number>): b2Hull;
  b2MakeProxy(points: ArrayLike<number>, radius: number): b2ShapeProxy;
  b2MakeOffsetProxy(points: ArrayLike<number>, radius: number, position: b2Vec2, rotation: b2Rot): b2ShapeProxy;
  b2ShapeDistance(input: b2DistanceInput, cache: b2SimplexCache, simplexes: b2Simplex[] | null, simplexCapacity: number): b2DistanceOutput;
  b2CollideChainSegmentAndCapsule(segmentA: b2ChainSegment, capsuleB: b2Capsule, xf: b2Transform, cache: b2SimplexCache): b2LocalManifold;
  b2CollideChainSegmentAndPolygon(segmentA: b2ChainSegment, polygonB: b2Polygon, xf: b2Transform, cache: b2SimplexCache): b2LocalManifold;
  b2DynamicTree_Query(tree: b2DynamicTree | null, aabb: b2AABB, maskBits: bigint, callback: (proxyId: number, userData: bigint) => boolean | void): b2TreeStats;
  b2DynamicTree_QueryAll(tree: b2DynamicTree | null, aabb: b2AABB, callback: (proxyId: number, userData: bigint) => boolean | void): b2TreeStats;
  b2DynamicTree_CastRay(tree: b2DynamicTree | null, input: b2RayCastInput, maskBits: bigint, callback: (input: b2RayCastInput, proxyId: number, userData: bigint) => number): b2TreeStats;
  b2DynamicTree_CastBox(tree: b2DynamicTree | null, input: b2BoxCastInput, maskBits: bigint, callback: (input: b2BoxCastInput, proxyId: number, userData: bigint) => number): b2TreeStats;
  b2SolvePlanes(targetDelta: b2Vec2, planes: b2CollisionPlane[]): b2PlaneSolverResult;
  b2ClipVector(vector: b2Vec2, planes: b2CollisionPlane[]): b2Vec2;
  b2CreateWorld(def: b2WorldDef): b2WorldId;
  b2World_Draw(worldId: b2WorldId, draw: b2DebugDraw): void;
  b2World_OverlapAABB(worldId: b2WorldId, origin: b2Vec2, aabb: b2AABB, filter: b2QueryFilter, fcn: (shapeId: b2ShapeId) => boolean | void): b2TreeStats;
  b2World_OverlapShape(worldId: b2WorldId, origin: b2Vec2, proxy: b2ShapeProxy, filter: b2QueryFilter, fcn: (shapeId: b2ShapeId) => boolean | void): b2TreeStats;
  b2World_CastRay(worldId: b2WorldId, origin: b2Vec2, translation: b2Vec2, filter: b2QueryFilter, fcn: (shapeId: b2ShapeId, point: b2Vec2, normal: b2Vec2, fraction: number) => number): b2TreeStats;
  b2World_CastShape(worldId: b2WorldId, origin: b2Vec2, proxy: b2ShapeProxy, translation: b2Vec2, filter: b2QueryFilter, fcn: (shapeId: b2ShapeId, point: b2Vec2, normal: b2Vec2, fraction: number) => number): b2TreeStats;
  b2World_CollideMover(worldId: b2WorldId, origin: b2Vec2, mover: b2Capsule, filter: b2QueryFilter, fcn: (shapeId: b2ShapeId, planes: PlaneResultBuffer) => boolean | void): void;
  b2World_SetCustomFilterCallback(worldId: b2WorldId, fcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId) => boolean | void) | null): void;
  b2World_SetPreSolveCallback(worldId: b2WorldId, preSolveFcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId, manifold: b2Manifold) => void) | null, preContinuousFcn: ((shapeIdA: b2ShapeId, shapeIdB: b2ShapeId, point: b2Vec2, normal: b2Vec2) => boolean | void) | null): void;
  b2World_SetFrictionCallback(worldId: b2WorldId, callback: ((frictionA: number, userMaterialIdA: bigint, frictionB: number, userMaterialIdB: bigint) => number) | null): void;
  b2World_SetRestitutionCallback(worldId: b2WorldId, callback: ((restitutionA: number, userMaterialIdA: bigint, restitutionB: number, userMaterialIdB: bigint) => number) | null): void;
  b2Recording_GetData(recording: number): Uint8Array;
  b2World_GetSnapshot(worldId: b2WorldId): Uint8Array;
  b2World_Restore(worldId: b2WorldId, image: ArrayLike<number>): boolean;
  b2CreateWorldFromSnapshot(image: ArrayLike<number>, workerCount: number): b2WorldId;
  b2CreateBody(worldId: b2WorldId, def: b2BodyDef): b2BodyId;
  b2Shape_GetSensorData(shapeId: b2ShapeId): ShapeIdBuffer;
  b2CreateChain(bodyId: b2BodyId, def: b2ChainDef): b2ChainId;
  b2Joint_GetConstraintTuning(jointId: b2JointId): { hertz: number, dampingRatio: number };
  b2DistanceJoint_GetSpringForceRange(jointId: b2JointId): { lowerForce: number, upperForce: number };
  b2ValidateReplay(data: ArrayLike<number>, workerCount: number): boolean;
  b2CreateReplay(data: ArrayLike<number>, workerCount: number): number;
  b2Replay_DrawFrameQueries(player: number, draw: b2DebugDraw, queryIndex: number): void;
}

export type b2Pos = b2Vec2;
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
  readonly B2_NULL_INDEX: number;
  readonly B2_VERSION_MAJOR: number;
  readonly B2_VERSION_MINOR: number;
  readonly B2_VERSION_REVISION: number;
  readonly B2_HASH_INIT: number;
  readonly B2_HUGE: number;
  readonly B2_MAX_WORKERS: number;
  readonly B2_MAX_TASKS: number;
  readonly B2_GRAPH_COLOR_COUNT: number;
  readonly B2_LINEAR_SLOP: number;
  readonly B2_MAX_WORLDS: number;
  readonly B2_NAME_LENGTH: number;
  readonly B2_MAX_ROTATION: number;
  readonly B2_SPECULATIVE_DISTANCE: number;
  readonly B2_CONTACT_RECYCLE_DISTANCE: number;
  readonly B2_CONTACT_RECYCLE_COS_ANGLE: number;
  readonly B2_MAX_AABB_MARGIN: number;
  readonly B2_AABB_MARGIN_FRACTION: number;
  readonly B2_TIME_TO_SLEEP: number;
  readonly B2_MAX_RESTITUTION_ITERATIONS: number;
  readonly B2_DEFAULT_CATEGORY_BITS: bigint;
  readonly B2_DEFAULT_MASK_BITS: bigint;
  readonly B2_MAX_POLYGON_VERTICES: number;
  readonly b2_emptySimplexCache: b2SimplexCache;
  readonly B2_PI: number;
  readonly b2Vec2_zero: b2Vec2;
  readonly b2Rot_identity: b2Rot;
  readonly b2Transform_identity: b2Transform;
  readonly b2Mat22_zero: b2Mat22;
  readonly b2Pos_zero: b2Vec2;
  readonly b2WorldTransform_identity: b2Transform;
  readonly b2_nullWorldId: b2WorldId;
  readonly b2_nullBodyId: b2BodyId;
  readonly b2_nullShapeId: b2ShapeId;
  readonly b2_nullChainId: b2ChainId;
  readonly b2_nullJointId: b2JointId;
  readonly b2_nullContactId: b2ContactId;
}
export type Box2DModule = WasmModule & EmbindModule & Box2DFacade & Box2DConstants;
export default function Box2DFactory (options?: unknown): Promise<Box2DModule>;
