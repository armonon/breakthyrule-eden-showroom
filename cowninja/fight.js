// Fist fighting, straight from Break Thy Rule: every number, sound, popup and rule comes from the main game's shared
// melee core (melee-core.js, window.EdenMelee), the same one behind the fists in Eden.
//   attack   tap: jab, then cross, alternating. Hold: the haymaker. A blow just out of reach steps you into it.
//   combo    each blow in a chain hits harder; a haymaker as the third blow or later is a finisher (slow motion, down).
//   guard    held, it blocks (chip damage, drains guard stamina; an empty guard breaks). Raised just before a blow
//            lands it parries: no damage, the farmer is thrown off, and your next blow hits half again as hard.
//   farmers  have health; light blows make them flinch, heavy ones stagger them back, the last one puts them down as
//            a ragdoll. A farmer who has not seen you takes triple damage (a sucker punch).
import * as THREE from 'three/webgpu';

export function createFight({ foot, farmers, hooks = {} }) {
  const M = window.EdenMelee;
  if (!M) return { available: false, attack() {}, guard() {}, update() {}, incoming: () => 1, stamina: () => 100, raised: () => false };
  const now = () => performance.now() / 1000;
  const guard = M.guard(), feel = { hitStop: ms => hooks.hitStop?.(ms), shake: a => hooks.shake?.(a) };
  let swing = null, left = true;
  const able = () => foot.state.active && !foot.state.busy && !foot.state.climbing && !foot.state.airborne && !foot.state.hidden;
  const standing = () => farmers.farmers.filter(f => !f.ragdoll && !f.takedown);

  function punch(id) {
    if (!able() || (swing && now() < swing.until)) return;
    const move = M.move(id), p = foot.state, yaw = hooks.yaw?.() ?? p.yaw, fwd = { x: Math.sin(yaw), z: Math.cos(yaw) }, targets = standing().map(f => f.p);
    // Face the nearest farmer in front, and step into him if he is just out of reach.
    let best = null, bd = move.reach + 1.4;
    for (const t of targets) { const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fwd.x + dz * fwd.z) / (d || 1) > .3) { bd = d; best = t; } }
    const aim = best ? { x: (best.x - p.x) / (bd || 1), z: (best.z - p.z) / (bd || 1) } : fwd;
    foot.face?.(Math.atan2(aim.x, aim.z), move.windup + move.recover);
    const step = M.lunge(p, aim, targets, move); if (step) foot.shove?.(step.x * step.distance * 7, step.z * step.distance * 7);
    const clip = id === 'haymaker' ? 'hook' : id === 'cross' ? 'cross' : 'jab';
    foot.play(clip, { fade: .04, speed: id === 'haymaker' ? 1.25 : 1.7, mask: 'upper', arms: true });
    M.sound(id === 'haymaker' ? 'swoosh' : 'whoosh');
    swing = { id, move, aim, landAt: now() + move.windup, until: now() + move.windup + move.recover, done: false };
  }
  const input = M.charge({ light: () => { punch(left ? 'jab' : 'cross'); left = !left; }, heavy: () => punch('haymaker') });

  function land() {
    const { move, aim, id } = swing, p = foot.state; swing.done = true;
    let hit = null, hd = 1e9;
    for (const f of standing()) if (M.inReach(p, aim, f.p, move)) { const d = Math.hypot(f.p.x - p.x, f.p.z - p.z); if (d < hd) { hd = d; hit = f; } }
    if (!hit) { M.whiff(feel); return; }
    const unaware = hit.state !== 'chase' && !(hit.stun > 0), finisher = M.wouldFinish(move.tier), counter = M.takeCounter();
    const damage = move.damage * M.combo.multiplier() * (counter ? 1.5 : 1) * (unaware ? 3 : 1);
    const result = farmers.hurt(hit, damage, aim.x, aim.z, { tier: move.tier, finisher, force: move.force });
    M.land(result.ko ? (finisher ? 'finisher' : 'ko') : move.tier, { ...feel, label: unaware ? 'SUCKER PUNCH' : counter ? 'COUNTER' : move.label });
    if (result.ko && finisher) M.sound('finisher');
    hooks.onHit?.({ farmer: hit, ko: result.ko, id });
  }

  // A farmer's blow arrives. Returns how much of its damage gets through (0 parried, a chip when blocked, 1 otherwise).
  function incoming({ dx, dz, farmer, tier = 'light' }) {
    if (!foot.state.active) return 1;
    const face = foot.facing?.() ?? foot.state.yaw, facing = -(Math.sin(face) * dx + Math.cos(face) * dz) > .15;   // dx,dz: the way the blow travels
    const outcome = M.defend(guard, { tier, facing });
    if (outcome === 'parried') { M.land('parried', feel); farmers.stun?.(farmer, 1.3); return 0; }
    if (outcome === 'blocked') { M.land('blocked', feel); return M.GUARD.chip; }
    if (outcome === 'broken') { M.land('broken', { ...feel, combo: false }); return 1; }
    M.combo.reset(); return 1;
  }

  function update(dt) {
    M.guardTick(guard, dt);
    if (guard.raised && !able()) guard.lower();
    foot.setGuard?.(guard.raised ? 1 : 0);
    if (swing && !swing.done && now() >= swing.landAt) land();
  }
  return {
    available: true, update, incoming,
    attack(down) { if (down) { if (able()) input.down(); } else input.up(); },
    guard(down) { if (down && able()) guard.raise(); else guard.lower(); },
    cancel() { input.cancel(); guard.lower(); swing = null; },
    stamina: () => guard.stamina, raised: () => guard.raised, broken: () => guard.broken(), busy: () => !!swing && now() < swing.until,
  };
}
