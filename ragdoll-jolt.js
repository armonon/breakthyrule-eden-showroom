// Jolt ragdoll prototype: 14 capsule bodies driven over the character rig's named bones. Loaded on demand as an ES module.
// Every bone's rest rotation is identity, so a body's world rotation is simply its bone's world rotation relative to the
// character, and each body's origin is its bone's joint.
const JOLT_URL = '/assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.js';
const LAYER_STATIC = 0, LAYER_MOVING = 1;
const deg = d => d * Math.PI / 180;

export async function createJoltWorld() {
  const started = performance.now();
  const { default: initJolt } = await import(JOLT_URL);
  const Jolt = await initJolt();
  const settings = new Jolt.JoltSettings();
  settings.mMaxWorkerThreads = 0;
  const pairs = new Jolt.ObjectLayerPairFilterTable(2);
  pairs.EnableCollision(LAYER_STATIC, LAYER_MOVING);
  pairs.EnableCollision(LAYER_MOVING, LAYER_MOVING);
  const layers = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
  layers.MapObjectToBroadPhaseLayer(LAYER_STATIC, new Jolt.BroadPhaseLayer(0));
  layers.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(1));
  settings.mObjectLayerPairFilter = pairs;
  settings.mBroadPhaseLayerInterface = layers;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(layers, 2, pairs, 2);
  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const system = jolt.GetPhysicsSystem(), bodies = system.GetBodyInterface();
  const v = new Jolt.Vec3(), r = new Jolt.RVec3(), q = new Jolt.Quat();
  function box(center, half) {
    v.Set(half[0], half[1], half[2]); r.Set(center[0], center[1], center[2]); q.Set(0, 0, 0, 1);
    const shape = new Jolt.BoxShape(v, .02), make = new Jolt.BodyCreationSettings(shape, r, q, Jolt.EMotionType_Static, LAYER_STATIC);
    make.mFriction = .8;
    const body = bodies.CreateBody(make); Jolt.destroy(make);
    bodies.AddBody(body.GetID(), Jolt.EActivation_DontActivate);
    return { remove() { const id = body.GetID(); bodies.RemoveBody(id); bodies.DestroyBody(id); } };
  }
  return { Jolt, jolt, system, bodies, box, step: dt => jolt.Step(dt, 1), initMs: performance.now() - started,
    heapBytes: () => Jolt.HEAPU8?.buffer?.byteLength ?? null };
}

// a/b: capsule ends. limit: [normal half cone, plane half cone, twist]. tilt: degrees toward `toward` for the neutral angle.
const PARTS = [
  { bone: 'root', parent: null, a: b => b('upperleg01.L').add3(0, .05, 0), b: b => b('upperleg01.R').add3(0, .05, 0), r: .115, mass: 11 },
  { bone: 'spine02', parent: 'root', a: b => b('spine02'), b: b => b('spine01'), r: .12, mass: 9, axis: [0, 1, 0], plane: [0, 0, 1], limit: [24, 28, 14], torque: 320 },
  { bone: 'spine01', parent: 'spine02', a: b => b('upperarm01.L').lerp3(b('upperarm01.R'), .18), b: b => b('upperarm01.R').lerp3(b('upperarm01.L'), .18), r: .125, mass: 14, axis: [0, 1, 0], plane: [0, 0, 1], limit: [18, 24, 14], torque: 320 },
  { bone: 'neck01', parent: 'spine01', a: b => b('head').add3(0, .05, .01), b: b => b('head').add3(0, .13, .01), r: .095, mass: 5, axis: [0, 1, 0], plane: [0, 0, 1], limit: [32, 38, 45], torque: 45 },
];
for (const s of ['L', 'R']) PARTS.push(
  { bone: 'upperarm01.' + s, parent: 'spine01', a: b => b('upperarm01.' + s), b: b => b('lowerarm01.' + s), r: .05, mass: 2.6, along: 'lowerarm01.' + s, toward: [0, -1, .25], tilt: 22, limit: [85, 85, 55], torque: 70 },
  { bone: 'lowerarm01.' + s, parent: 'upperarm01.' + s, a: b => b('lowerarm01.' + s), b: b => b('wrist.' + s).lerp3(b('lowerarm01.' + s), -.55), r: .042, mass: 1.7, along: 'wrist.' + s, toward: [0, 0, 1], tilt: 66, limit: [4, 68, 45], torque: 40 },
  { bone: 'upperleg01.' + s, parent: 'root', a: b => b('upperleg01.' + s), b: b => b('lowerleg01.' + s), r: .075, mass: 8, along: 'lowerleg01.' + s, toward: [0, 0, 1], tilt: 34, limit: [30, 68, 22], torque: 260 },
  { bone: 'lowerleg01.' + s, parent: 'upperleg01.' + s, a: b => b('lowerleg01.' + s), b: b => b('foot.' + s), r: .055, mass: 4, along: 'foot.' + s, toward: [0, 0, -1], tilt: 66, limit: [4, 68, 8], torque: 220 },
  { bone: 'foot.' + s, parent: 'lowerleg01.' + s, a: b => b('foot.' + s), b: b => b('toes.' + s), r: .042, mass: 1.1, axis: [0, 0, 1], plane: [0, 1, 0], limit: [10, 26, 8], torque: 90 },
);

export function createRagdoll(world, T, model) {
  const { Jolt, system, bodies } = world;
  const group = model.root, scale = group.scale.x, bones = model.skeleton.bones, rest = new Map();
  bones.forEach((bone, i) => { const e = model.skeleton.boneInverses[i].elements; rest.set(bone.name, new T.Vector3(-e[12], -e[13], -e[14]).multiplyScalar(scale)); });
  const point = name => { const p = rest.get(name).clone(); p.add3 = (x, y, z) => p.add(new T.Vector3(x, y, z)); p.lerp3 = (o, k) => { const c = p.clone().lerp(o, k); c.add3 = p.add3; return c; }; return p; };
  const skeleton = new Jolt.Skeleton(), make = new Jolt.RagdollSettings();
  make.mSkeleton = skeleton;
  PARTS.forEach(part => skeleton.AddJoint(new Jolt.JPHString(part.bone, part.bone.length), part.parent ? PARTS.findIndex(p => p.bone === part.parent) : -1));
  make.mParts.resize(PARTS.length);
  const vec = (x, y, z) => new Jolt.Vec3(x, y, z), up = new T.Vector3(0, 1, 0), turn = new T.Quaternion();
  PARTS.forEach((part, i) => {
    const out = make.mParts.at(i), head = rest.get(part.bone), a = part.a(point), b = part.b(point), mid = a.clone().add(b).multiplyScalar(.5).sub(head);
    const length = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    turn.setFromUnitVectors(up, dir);
    const capsule = new Jolt.CapsuleShapeSettings(Math.max(length / 2, .005), part.r), placed = new Jolt.RotatedTranslatedShapeSettings(vec(mid.x, mid.y, mid.z), new Jolt.Quat(turn.x, turn.y, turn.z, turn.w), capsule);
    const result = placed.Create(); if (result.HasError()) throw Error(result.GetError().c_str());
    out.SetShape(result.Get());
    out.mPosition = new Jolt.RVec3(head.x, head.y, head.z); out.mRotation = new Jolt.Quat(0, 0, 0, 1);
    out.mMotionType = Jolt.EMotionType_Dynamic; out.mObjectLayer = LAYER_MOVING;
    out.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia; out.mMassPropertiesOverride.mMass = part.mass;
    out.mFriction = .7; out.mRestitution = 0; out.mLinearDamping = .05; out.mAngularDamping = .35;
    if (!part.parent) return;
    const d = part.along ? rest.get(part.along).clone().sub(head).normalize() : new T.Vector3(...part.axis).normalize();
    const t = part.along ? new T.Vector3(...part.toward).addScaledVector(d, -new T.Vector3(...part.toward).dot(d)).normalize() : new T.Vector3(...part.plane).normalize();
    const c = Math.cos(deg(part.tilt || 0)), s = Math.sin(deg(part.tilt || 0));
    const twist1 = d.clone().multiplyScalar(c).addScaledVector(t, s), plane1 = t.clone().multiplyScalar(c).addScaledVector(d, -s);
    const joint = new Jolt.SwingTwistConstraintSettings();
    joint.mPosition1 = joint.mPosition2 = new Jolt.RVec3(head.x, head.y, head.z);
    joint.mTwistAxis1 = vec(twist1.x, twist1.y, twist1.z); joint.mPlaneAxis1 = vec(plane1.x, plane1.y, plane1.z);
    joint.mTwistAxis2 = vec(d.x, d.y, d.z); joint.mPlaneAxis2 = vec(t.x, t.y, t.z);
    joint.mNormalHalfConeAngle = deg(part.limit[0]); joint.mPlaneHalfConeAngle = deg(part.limit[1]);
    joint.mTwistMinAngle = -deg(part.limit[2]); joint.mTwistMaxAngle = deg(part.limit[2]);
    joint.mMaxFrictionTorque = part.mass * .55;
    for (const motor of [joint.mSwingMotorSettings, joint.mTwistMotorSettings]) { motor.mSpringSettings.mFrequency = 7; motor.mSpringSettings.mDamping = 1; motor.mMinTorqueLimit = -part.torque; motor.mMaxTorqueLimit = part.torque; }
    out.mToParent = joint;
  });
  make.GetSkeleton().CalculateParentJointIndices();
  make.Stabilize();
  make.DisableParentChildCollisions();
  make.CalculateBodyIndexToConstraintIndex();
  make.CalculateConstraintIndexToBodyIdxPair();
  const ragdoll = make.CreateRagdoll(createRagdoll.next = (createRagdoll.next || 0) + 1, 0, system);
  const pose = new Jolt.SkeletonPose(); pose.SetSkeleton(make.GetSkeleton());
  const ids = PARTS.map((_, i) => new Jolt.BodyID(ragdoll.GetBodyID(i).GetIndexAndSequenceNumber())), joints = PARTS.map((_, i) => i ? Jolt.castObject(ragdoll.GetConstraint(i - 1), Jolt.SwingTwistConstraint) : null);
  const partIndex = new Map(PARTS.map((p, i) => [p.bone, i])), parentIndex = PARTS.map(p => p.parent ? partIndex.get(p.parent) : -1);
  const totalMass = PARTS.reduce((m, p) => m + p.mass, 0), groupQ = new T.Quaternion(), invGroup = new T.Quaternion(), P = PARTS.map(() => new T.Vector3()), Q = PARTS.map(() => new T.Quaternion());
  const prevP = PARTS.map(() => new T.Vector3()), prevQ = PARTS.map(() => new T.Quaternion()), world_ = new Map(), tmpQ = new T.Quaternion(), tmpV = new T.Vector3();
  const rv = new Jolt.RVec3(), jq = new Jolt.Quat(), jv = new Jolt.Vec3(), jw = new Jolt.Vec3();
  // The bindings hand back one shared temporary per return type, so copy every value out straight away.
  const posOf = id => { const p = bodies.GetPosition(id); return new T.Vector3(p.GetX(), p.GetY(), p.GetZ()); };
  const velOf = id => { const p = bodies.GetLinearVelocity(id); return new T.Vector3(p.GetX(), p.GetY(), p.GetZ()); };
  const spinOf = id => { const p = bodies.GetAngularVelocity(id); return new T.Vector3(p.GetX(), p.GetY(), p.GetZ()); };
  const rotOf = id => { const r = bodies.GetRotation(id); return new T.Quaternion(r.GetX(), r.GetY(), r.GetZ(), r.GetW()); };
  let inWorld = false, motorState = false, strength = 1, hasPrev = false;

  // World pose of every part, read from the bones' local values so it is independent of three.js matrix updates.
  function readBones() {
    group.updateWorldMatrix(true, false); group.getWorldQuaternion(groupQ);
    for (const bone of bones) {
      const parent = world_.get(bone.parent), q = (world_.get(bone) || { q: new T.Quaternion(), p: new T.Vector3() });
      if (parent) { q.q.copy(parent.q).multiply(bone.quaternion); q.p.copy(bone.position).multiplyScalar(scale).applyQuaternion(parent.q).add(parent.p); }
      else { q.q.copy(groupQ).multiply(bone.quaternion); q.p.copy(bone.position).applyMatrix4(group.matrixWorld); }
      world_.set(bone, q);
    }
    PARTS.forEach((part, i) => { const w = world_.get(model.byName[part.bone]); P[i].copy(w.p); Q[i].copy(w.q); });
  }
  function loadPose() {
    readBones();
    PARTS.forEach((_, i) => {
      const out = pose.GetJoint(i), p = parentIndex[i];
      if (p < 0) { jq.Set(Q[i].x, Q[i].y, Q[i].z, Q[i].w); out.mRotation = jq; rv.Set(0, 0, 0); out.mTranslation = rv; rv.Set(P[i].x, P[i].y, P[i].z); pose.SetRootOffset(rv); return; }
      tmpQ.copy(Q[p]).invert(); tmpV.copy(P[i]).sub(P[p]).applyQuaternion(tmpQ); tmpQ.multiply(Q[i]);
      jq.Set(tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w); out.mRotation = jq; jv.Set(tmpV.x, tmpV.y, tmpV.z); out.mTranslation = jv;
    });
    pose.CalculateJointMatrices();
  }
  function setMotors(on, k = 1) {
    strength = k;
    joints.forEach((joint, i) => {
      if (!joint) return;
      if (on !== motorState) { const state = on ? Jolt.EMotorState_Position : Jolt.EMotorState_Off; joint.SetSwingMotorState(state); joint.SetTwistMotorState(state); }
      if (on) { const limit = PARTS[i].torque * k; for (const motor of [joint.GetSwingMotorSettings(), joint.GetTwistMotorSettings()]) { motor.mMinTorqueLimit = -limit; motor.mMaxTorqueLimit = limit; } }
    });
    motorState = on;
  }
  const api = {
    parts: PARTS.length,
    // Call each frame while animated, so a hit can inherit how fast each bone was already moving.
    remember() { readBones(); P.forEach((p, i) => { prevP[i].copy(p); prevQ[i].copy(Q[i]); }); hasPrev = true; },
    // impulse(y): extra velocity for a body at height y above the feet.
    start({ impulse = null, dt = 1 / 60, active = false } = {}) {
      const hadPrev = hasPrev; loadPose();
      if (!inWorld) { ragdoll.AddToPhysicsSystem(Jolt.EActivation_Activate); inWorld = true; }
      ragdoll.SetPose(pose); ragdoll.ResetWarmStart();
      const base = group.getWorldPosition(new T.Vector3()).y, w = new T.Vector3(), dq = new T.Quaternion();
      ids.forEach((id, i) => {
        const v = hadPrev ? P[i].clone().sub(prevP[i]).divideScalar(dt) : new T.Vector3();
        if (hadPrev) { dq.copy(Q[i]).multiply(prevQ[i].clone().invert()); if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w); const s = Math.hypot(dq.x, dq.y, dq.z); w.set(dq.x, dq.y, dq.z).multiplyScalar(s > 1e-5 ? 2 * Math.atan2(s, dq.w) / s / dt : 0); } else w.set(0, 0, 0);
        if (impulse) v.add(impulse(P[i].y - base));
        jv.Set(v.x, v.y, v.z); jw.Set(w.x, w.y, w.z); bodies.SetLinearAndAngularVelocity(id, jv, jw);
      });
      setMotors(active, active ? .35 : 1);
    },
    // Active mode: drive joints toward the rig's current procedural pose, with the pelvis pulled to its target.
    drive(k) {
      loadPose(); setMotors(true, k); ragdoll.DriveToPoseUsingMotors(pose); ragdoll.Activate();
      const pelvis = ids[0], at = posOf(pelvis), vel = velOf(pelvis), wn = spinOf(pelvis), rot = rotOf(pelvis);
      const off = tmpV.copy(P[0]).sub(at), stiffness = 90 * k, damping = 2 * Math.sqrt(stiffness);
      jv.Set(totalMass * (stiffness * off.x - damping * vel.x), totalMass * (stiffness * off.y + 9.81 * k - damping * vel.y), totalMass * (stiffness * off.z - damping * vel.z));
      bodies.AddForce(pelvis, jv);
      const distance = off.length(), err = tmpQ.copy(Q[0]).multiply(rot.invert()); if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
      const s = Math.hypot(err.x, err.y, err.z), a = s > 1e-5 ? 2 * Math.atan2(s, err.w) / s : 0, ts = 700 * k, td = 70 * k;
      jw.Set(ts * a * err.x - td * wn.x, ts * a * err.y - td * wn.y, ts * a * err.z - td * wn.z);
      bodies.AddTorque(pelvis, jw);
      return distance;
    },
    limp() { setMotors(false); },
    // Bodies back onto the bones. Unmapped bones (spine03, clavicles, wrists, head, toes) ride rigidly with their parents.
    apply() {
      group.updateWorldMatrix(true, false); group.getWorldQuaternion(groupQ); invGroup.copy(groupQ).invert();
      PARTS.forEach((_, i) => { Q[i].copy(rotOf(ids[i])); P[i].copy(posOf(ids[i])); });
      const worldQ = new Map();
      for (const bone of bones) {
        const parent = worldQ.get(bone.parent), i = partIndex.get(bone.name), mine = new T.Quaternion();
        if (i !== undefined) { mine.copy(invGroup).multiply(Q[i]); bone.quaternion.copy(parent ? parent.clone().invert().multiply(mine) : mine); if (!parent) bone.position.copy(group.worldToLocal(P[i].clone())); }
        else if (!/^(thumb|index|middle|ring|pinky)/.test(bone.name)) { bone.quaternion.identity(); mine.copy(parent || mine); }
        else mine.copy(parent || mine).multiply(bone.quaternion);
        worldQ.set(bone, mine);
      }
    },
    pelvis: () => posOf(ids[0]),
    maxSpeed() { let m = 0; for (const id of ids) m = Math.max(m, velOf(id).length()); return m; },
    // Widest gap between a joint's anchor as seen from parent and child: how far the chain has pulled apart.
    jointGap() {
      let max = 0;
      PARTS.forEach((part, i) => {
        if (!part.parent) return;
        const p = parentIndex[i];
        tmpV.copy(rest.get(part.bone)).sub(rest.get(part.parent)).applyQuaternion(rotOf(ids[p])).add(posOf(ids[p]));
        max = Math.max(max, tmpV.distanceTo(posOf(ids[i])));
      });
      return max;
    },
    end() { if (inWorld) { setMotors(false); ragdoll.RemoveFromPhysicsSystem(); inWorld = false; } hasPrev = false; },
  };
  return api;
}
