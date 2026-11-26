// What the people around you know, made visible. Over each head within range: a mark that fills as he grows
// suspicious (? amber), turns to ! when he has you, and the line he calls out. Crouched on foot, the nearest
// guards' sight is drawn on the ground as a faint cone, so you can read the gaps between them.
import * as THREE from 'three/webgpu';

export function createAwareness({ root, scene, camera, farmers }) {
  const host = document.createElement('div'); host.className = 'cn-aware'; root.appendChild(host);
  const pool = [], v = new THREE.Vector3();
  function tag(i) {
    if (pool[i]) return pool[i];
    const el = document.createElement('div'); el.className = 'cn-mark'; el.innerHTML = '<b></b><i><s></s></i><em></em>'; host.appendChild(el);
    return pool[i] = { el, glyph: el.children[0], fill: el.children[1].firstChild, say: el.children[2], shown: false };
  }
  // Sight cones: a fan on the ground, one per guard nearest you (three at most).
  // Faint inside, a brighter rim where sight ends (a radial alpha map over the fan's planar UVs).
  const rim = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,.15)'); r.addColorStop(.86, 'rgba(255,255,255,.3)'); r.addColorStop(.94, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const coneGeometry = new THREE.CircleGeometry(1, 28, Math.PI / 2 - 1.05, 2.1), cones = [];
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: 0xffc04a, alphaMap: rim, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.visible = false; scene.add(m); cones.push(m); }

  function update({ actor, crouched, width, height, time, live, sight = 24 }) {
    let n = 0;
    const list = farmers.farmers.filter(f => !f.ragdoll && !f.takedown && Math.hypot(f.p.x - actor.x, f.p.z - actor.z) < 48);
    for (const f of list) {
      const show = live && (f.alert > .06 || f.state === 'chase' || f.state === 'flee' || f.state === 'search' || (f.say && time < f.sayUntil));
      if (!show) continue;
      v.set(f.p.x, 2.25, f.p.z).project(camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      const t = tag(n++), hot = f.state === 'chase' || f.alert >= 1, fleeing = f.state === 'flee';
      t.el.style.transform = `translate(${((v.x * .5 + .5) * width).toFixed(1)}px, ${((-v.y * .5 + .5) * height).toFixed(1)}px)`;
      t.el.dataset.state = hot ? 'hot' : fleeing ? 'flee' : 'warm';
      t.glyph.textContent = hot ? '!' : fleeing ? '☎' : '?';
      t.fill.style.transform = `scaleX(${(hot ? 1 : Math.min(1, f.alert)).toFixed(2)})`;
      const line = f.say && time < f.sayUntil ? f.say : ''; if (t.say.textContent !== line) t.say.textContent = line;
      if (!t.shown) { t.el.hidden = false; t.shown = true; }
    }
    for (let i = n; i < pool.length; i++) if (pool[i].shown) { pool[i].el.hidden = true; pool[i].shown = false; }
    // Cones while crouched.
    const near = crouched && live ? list.filter(f => f.state !== 'flee' && f.state !== 'cower').sort((a, b) => Math.hypot(a.p.x - actor.x, a.p.z - actor.z) - Math.hypot(b.p.x - actor.x, b.p.z - actor.z)).slice(0, 3) : [];
    cones.forEach((m, i) => { const f = near[i]; m.visible = !!f && Math.hypot(f.p.x - actor.x, f.p.z - actor.z) < 30; if (!m.visible) return;
      const busy = f.act && f.atPost && f.alert < .3 ? .45 : 1; m.position.set(f.p.x, .08, f.p.z); m.rotation.z = -f.yaw; m.scale.setScalar(sight * .5 * busy);
      m.material.color.set(f.state === 'chase' ? 0xff3020 : f.alert > .3 ? 0xffa030 : 0xffe08a); m.material.opacity = f.state === 'chase' ? .7 : .4 + f.alert * .3; });
  }
  return { update };
}
