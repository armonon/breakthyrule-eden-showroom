// COWNinja physics: a thin layer over the game's Jolt runtime (ragdoll-jolt.js) for the things this mode adds:
// heavy dynamic bodies (the cow, trucks, smashable props), rotated static geometry (ramps), and simple ragdolls made
// of boxes joined by swing-twist constraints. Positions are plain arrays; three.js objects are synced by the caller.
import { createJoltWorld } from '/ragdoll-jolt.js';

const STATIC = 0, MOVING = 1;

export async function createPhysics({ gravity = -19 } = {}) {
  const world = await createJoltWorld();
  const { Jolt, system, bodies } = world;
  { const g = new Jolt.Vec3(0, gravity, 0); system.SetGravity(g); Jolt.destroy(g); }
  const tv = new Jolt.Vec3(), tr = new Jolt.RVec3(), tq = new Jolt.Quat();
  const vec = (x, y, z) => { tv.Set(x, y, z); return tv; };
  let nextGroup = 1;

  function finish(settings, { friction = .7, restitution = .05, linearDamping = .05, angularDamping = .1, mass = null, dofs = null, group = null } = {}) {
    settings.mFriction = friction; settings.mRestitution = restitution;
    settings.mLinearDamping = linearDamping; settings.mAngularDamping = angularDamping;
    if (mass) { settings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia; settings.mMassPropertiesOverride.mMass = mass; }
    if (dofs != null) settings.mAllowedDOFs = dofs;
    if (group) { settings.mCollisionGroup.SetGroupFilter(group.filter); settings.mCollisionGroup.SetGroupID(group.id); settings.mCollisionGroup.SetSubGroupID(group.sub); }
    const isStatic = !!settings.__static, body = bodies.CreateBody(settings); Jolt.destroy(settings);
    const id = body.GetID();
    bodies.AddBody(id, isStatic ? Jolt.EActivation_DontActivate : Jolt.EActivation_Activate);
    return wrap(body, id);
  }

  function wrap(body, id) {
    const out = { p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };
    return {
      body, id,
      // Read the transform into reusable arrays (no allocation per frame).
      read() {
        const p = body.GetPosition(), q = body.GetRotation();
        out.p[0] = p.GetX(); out.p[1] = p.GetY(); out.p[2] = p.GetZ();
        out.q[0] = q.GetX(); out.q[1] = q.GetY(); out.q[2] = q.GetZ(); out.q[3] = q.GetW();
        return out;
      },
      velocity() { const v = body.GetLinearVelocity(); out.v[0] = v.GetX(); out.v[1] = v.GetY(); out.v[2] = v.GetZ(); return out.v; },
      setVelocity(x, y, z) { bodies.SetLinearVelocity(id, vec(x, y, z)); },
      setSpin(x, y, z) { bodies.SetAngularVelocity(id, vec(x, y, z)); },
      impulse(x, y, z) { bodies.AddImpulse(id, vec(x, y, z)); },
      spinImpulse(x, y, z) { bodies.AddAngularImpulse(id, vec(x, y, z)); },
      place(x, y, z, qx = 0, qy = 0, qz = 0, qw = 1) { tr.Set(x, y, z); tq.Set(qx, qy, qz, qw); bodies.SetPositionAndRotation(id, tr, tq, Jolt.EActivation_Activate); },
      wake() { bodies.ActivateBody(id); },
      remove() { bodies.RemoveBody(id); bodies.DestroyBody(id); },
    };
  }

  // Static box, optionally rotated (quaternion [x,y,z,w]) for ramps.
  function staticBox(center, half, quat = [0, 0, 0, 1], { friction = .9 } = {}) {
    const shape = new Jolt.BoxShape(vec(half[0], half[1], half[2]), .02);
    tr.Set(center[0], center[1], center[2]); tq.Set(quat[0], quat[1], quat[2], quat[3]);
    const s = new Jolt.BodyCreationSettings(shape, tr, tq, Jolt.EMotionType_Static, STATIC); s.__static = true;
    return finish(s, { friction });
  }

  // Dynamic box. `com` lowers or shifts the centre of mass (a truck that is hard to tip until hit right).
  function dynamicBox(center, half, options = {}) {
    let shape;
    if (options.com) {
      const inner = new Jolt.BoxShapeSettings(vec(half[0], half[1], half[2]), .03);
      const offset = new Jolt.OffsetCenterOfMassShapeSettings(new Jolt.Vec3(options.com[0], options.com[1], options.com[2]), inner);
      shape = offset.Create().Get();
    } else shape = new Jolt.BoxShape(vec(half[0], half[1], half[2]), .03);
    const quat = options.quat || [0, 0, 0, 1];
    tr.Set(center[0], center[1], center[2]); tq.Set(quat[0], quat[1], quat[2], quat[3]);
    return finish(new Jolt.BodyCreationSettings(shape, tr, tq, Jolt.EMotionType_Dynamic, MOVING), options);
  }

  // A ragdoll: parts [{name, center, half, mass}], joints [{a, b, at, axis, cone, twist}] by part name.
  // Jointed neighbours do not collide with each other; everything else does.
  function ragdoll(parts, joints, { friction = .8 } = {}) {
    const filter = new Jolt.GroupFilterTable(parts.length), index = new Map(parts.map((p, i) => [p.name, i])), id = nextGroup++;
    for (const j of joints) filter.DisableCollision(index.get(j.a), index.get(j.b));
    const made = new Map(), constraints = [];
    parts.forEach((p, i) => made.set(p.name, dynamicBox(p.center, p.half, { quat: p.quat, mass: p.mass, friction, restitution: .1, linearDamping: .08, angularDamping: .45, group: { filter, id, sub: i } })));
    for (const j of joints) {
      const c = new Jolt.SwingTwistConstraintSettings(); c.mSpace = Jolt.EConstraintSpace_WorldSpace;
      const at = new Jolt.RVec3(j.at[0], j.at[1], j.at[2]), axis = new Jolt.Vec3(...(j.axis || [0, -1, 0])), plane = new Jolt.Vec3(...(j.plane || [1, 0, 0]));
      c.mPosition1 = at; c.mPosition2 = at; c.mTwistAxis1 = axis; c.mTwistAxis2 = axis; c.mPlaneAxis1 = plane; c.mPlaneAxis2 = plane;
      c.mNormalHalfConeAngle = j.cone ?? .7; c.mPlaneHalfConeAngle = j.cone2 ?? j.cone ?? .7; c.mTwistMinAngle = -(j.twist ?? .3); c.mTwistMaxAngle = j.twist ?? .3;
      const constraint = c.Create(made.get(j.a).body, made.get(j.b).body); system.AddConstraint(constraint); constraints.push(constraint);
      Jolt.destroy(at); Jolt.destroy(axis); Jolt.destroy(plane); Jolt.destroy(c);
    }
    return {
      parts: made,
      remove() { for (const c of constraints) system.RemoveConstraint(c); for (const b of made.values()) b.remove(); },
    };
  }

  const DOF = {
    upright: Jolt.EAllowedDOFs_TranslationX | Jolt.EAllowedDOFs_TranslationY | Jolt.EAllowedDOFs_TranslationZ | Jolt.EAllowedDOFs_RotationY,
  };
  return { Jolt, world, staticBox, dynamicBox, ragdoll, DOF, step: dt => world.step(dt), dispose: () => world.dispose() };
}
