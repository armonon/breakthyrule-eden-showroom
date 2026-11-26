// Only paired actions apply authored horizontal root motion. Parkour displacement remains controller-owned.
const hipScale = model => {
  // Character holders proxy their current motion rig. The holder's userData can still belong to the stand-in
  // after a Rocketbox swap, and the live pelvis position changes with every animation frame.
  const height = model.motion?.bindHipHeight?.();
  if (Number.isFinite(height) && height > 0) return height;
  const root = model.skeleton?.bones?.findIndex(b => b.name === 'root'), inverse = model.skeleton?.boneInverses?.[root];
  return inverse ? Math.abs(inverse.clone().invert().elements[13] * model.root.scale.y) : 1;
};
export function pairedAnchor(anim, attacker, victim, { x, z, yaw, start }) {
  const a = anim.rootOffset?.('stealthAssassin', start) || { x: 0, z: 0 }, v = anim.rootOffset?.('stealthVictim', start) || { x: 0, z: 0 };
  const sa = hipScale(attacker), sv = hipScale(victim);
  // Source hand/neck measurements during the grapple place the initial victim 1.83 hip heights forward. Rebase
  // that separation at the chosen source start, including the approach that gameplay already performed.
  const dx = v.x * sv - a.x * sa, dz = 1.83 * (sa + sv) / 2 + v.z * sv - a.z * sa;
  return { x: x - Math.cos(yaw) * dx - Math.sin(yaw) * dz, z: z + Math.sin(yaw) * dx - Math.cos(yaw) * dz };
}
export function animationPath(anim, id, model, { x, z, yaw, start = 0, end = anim.duration(id) }) {
  const base = anim.rootOffset?.(id, start) || { x: 0, z: 0 };
  const scale = hipScale(model), c = Math.cos(yaw), s = Math.sin(yaw);
  return { start, end, duration: end - start, sample(progress) {
    const time = start + Math.max(0, Math.min(1, progress)) * (end - start), point = anim.rootOffset?.(id, time) || base;
    const dx = (point.x - base.x) * scale, dz = (point.z - base.z) * scale;
    return { x: x + c * dx + s * dz, z: z - s * dx + c * dz, time };
  } };
}

// Sweep the alignment and every authored frame before taking control. A failed check leaves both actors free.
export function clearAnimationPath(world, path, y, from = path.sample(0)) {
  const clear = p => !world.solidAt(p.x, y + .35, p.z, .26) && !world.solidAt(p.x, y + 1.4, p.z, .26);
  const segment = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .08));
    for (let i = 0; i <= n; i++) if (!clear({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n })) return false;
    return true;
  };
  let at = path.sample(0);
  if (!segment(from, at)) return false;
  const frames = Math.max(1, Math.ceil(path.duration * 30));
  for (let i = 1; i <= frames; i++) { const next = path.sample(i / frames); if (!segment(at, next)) return false; at = next; }
  return true;
}
