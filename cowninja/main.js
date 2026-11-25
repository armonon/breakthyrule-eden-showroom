// COWNinja prototype: ride the cow into the yard, break the pen gate, lead the herd out through the north gate.
// Its own page on the new renderer (three.js WebGPURenderer, WebGL2 fallback), sharing only the Jolt runtime with
// the rest of the game. Debug handle: window.cowNinja.
import * as THREE from 'three/webgpu';
import { createPhysics } from '/cowninja/physics.js';
import { createWorld } from '/cowninja/world.js';
import { createCow } from '/cowninja/cow.js';
import { createFarmers } from '/cowninja/farmers.js';
import { createTruck } from '/cowninja/truck.js';
import { createHerd } from '/cowninja/herd.js';
import { createBlood } from '/cowninja/blood.js';
import { createGrimPost } from '/cowninja/post.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const STEP = 1 / 60;

async function boot() {
  const container = $('scene'), status = $('cn-status');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: query.get('webgl') === '1', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(container.clientWidth, container.clientHeight, false);
  container.append(renderer.domElement); await renderer.init();
  $('cn-backend').textContent = renderer.backend?.isWebGPUBackend ? 'WEBGPU' : 'WEBGL2';

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10151a); scene.fog = new THREE.FogExp2(0x161c21, .012);
  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, .1, 320);
  status.textContent = 'Starting physics…';
  const physics = await createPhysics();
  const world = createWorld({ scene, physics });
  const blood = createBlood({ scene });
  const stats = { knockouts: 0, herdKnockouts: 0, flips: 0, hits: 0, start: 0, time: 0 };
  let health = 100, hurtFlash = 0, shake = 0, phase = 'intro', message = '', messageUntil = 0, alarm = false;
  const say = (text, seconds = 2.6) => { message = text; messageUntil = performance.now() + seconds * 1000; $('cn-toast').textContent = text; $('cn-toast').classList.add('show'); };

  const cow = createCow({ scene, physics, spawn: world.spawn });
  function damage(amount, dx, dz, push) {
    if (phase !== 'play') return; health = Math.max(0, health - amount); stats.hits++; hurtFlash = 1; shake = Math.max(shake, .5);
    cow.hit(dx, dz, push); blood.burst(cow.state.x, 1.2, cow.state.z, dx * 4, dz * 4, 6);
    if (health <= 0) end(false);
  }
  function raiseAlarm() { if (alarm) return; alarm = true; truck.start(); }
  function onEvent(e) {
    if (e.type === 'knockout') { e.by === 'herd' ? stats.herdKnockouts++ : stats.knockouts++; shake = Math.max(shake, Math.min(.9, e.speed / 16)); if (e.by !== 'herd') say(e.speed > 13 ? 'FLATTENED' : 'KNOCKED OUT', 1.2); raiseAlarm(); }
    else if (e.type === 'spotted') { say('SPOTTED', 1.4); }
    else if (e.type === 'stabbed') damage(11, e.dx, e.dz, 3.2);
    else if (e.type === 'run-over') damage(Math.min(40, 14 + e.speed * 1.6), e.dx, e.dz, 7);
    else if (e.type === 'rammed-truck') { shake = 1; say(e.square > .88 ? 'PERFECT ANGLE' : 'SIDE HIT', 1.4); }
    else if (e.type === 'glanced') { shake = Math.max(shake, .35); }
    else if (e.type === 'flipped') { stats.flips++; say('TRUCK FLIPPED', 2); }
    else if (e.type === 'truck-coming') say('THEY CALLED THE TRUCK', 2.4);
  }
  const farmers = createFarmers({ scene, physics, world, cow, blood, onEvent });
  const truck = createTruck({ scene, physics, world, cow, blood, onEvent });
  const herd = createHerd({ scene, world, cow, farmers });
  const post = createGrimPost({ renderer, scene, camera });

  // Input.
  const keys = new Set(), map = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space' };
  addEventListener('keydown', e => { const k = map[e.code]; if (!k) { if (e.code === 'KeyR' && phase !== 'intro') restart(); return; } e.preventDefault(); if (k === 'space' && e.repeat) return; keys.add(k); });
  addEventListener('keyup', e => { const k = map[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  function end(won) {
    phase = won ? 'won' : 'lost'; stats.time = (performance.now() - stats.start) / 1000;
    $('cn-end-title').textContent = won ? 'THE HERD IS OUT' : 'THEY GOT YOU';
    $('cn-end-body').textContent = won
      ? `${herd.saved} of ${herd.count} cows freed · ${stats.knockouts + stats.herdKnockouts} farmers down (${stats.herdKnockouts} by the stampede) · ${stats.flips} truck${stats.flips === 1 ? '' : 's'} flipped · ${stats.hits} hits taken · ${stats.time.toFixed(0)} s`
      : `${stats.knockouts} farmers down · ${stats.flips} truck${stats.flips === 1 ? '' : 's'} flipped · ${herd.free ? 'the herd was loose' : 'the herd is still penned'}`;
    $('cn-end').hidden = false;
  }
  function restart() { location.reload(); }
  $('cn-again').onclick = restart;
  $('cn-enter').onclick = () => { $('cn-gate').hidden = true; phase = 'play'; stats.start = performance.now(); renderer.domElement.focus(); say('BREAK THE PEN GATE · SHIFT TO CHARGE', 4); };

  // Camera: behind and above, swinging wider and lower with speed, shaken by impacts.
  const camPos = new THREE.Vector3(world.spawn.x, 6, world.spawn.z - 9), camAim = new THREE.Vector3(), want = new THREE.Vector3();
  function updateCamera(dt) {
    const c = cow.state, fast = Math.min(1, Math.abs(c.speed) / cow.TUNE.charge), back = 6.2 + fast * 2.6, up = 3.3 - fast * .9;
    want.set(c.x - c.forward.x * back, c.y + up, c.z - c.forward.z * back);
    camPos.lerp(want, 1 - Math.exp(-(3.2 + fast * 2) * dt)); if (camPos.y < .6) camPos.y = .6;
    camAim.set(c.x + c.forward.x * (2.5 + fast * 4), c.y + 1.35, c.z + c.forward.z * (2.5 + fast * 4));
    shake = Math.max(0, shake - dt * 2.4);
    camera.position.copy(camPos); if (shake > 0) camera.position.add(want.set((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(shake * .35));
    camera.lookAt(camAim);
    const fov = 62 + fast * 16 + c.charge * 5; if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  }

  const hud = { speed: $('cn-speed'), charge: $('cn-charge-fill'), health: $('cn-health-fill'), goal: $('cn-goal'), count: $('cn-count') };
  let last = performance.now(), acc = 0, hudAt = 0;
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
    const live = phase === 'play';
    let steps = 0;
    while (acc >= STEP && steps < 4) { cow.control(STEP, keys, !live); physics.step(STEP); acc -= STEP; steps++; }
    if (steps === 4) acc = 0;
    const time = now / 1000;
    cow.update(dt); world.update(time); farmers.update(dt, time, live); truck.update(dt, live); herd.update(dt, time); blood.update(dt);
    if (live) {
      if (!herd.free && world.gateBroken()) { herd.release(); raiseAlarm(); say('THE GATE IS DOWN · LEAD THEM NORTH', 3.5); }
      // Won: the rider is out past the north gate and at least half the herd has followed.
      if (herd.free && cow.state.z < -51 && herd.saved >= Math.ceil(herd.count / 2)) end(true);
    }
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6); post.set({ hurt: hurtFlash * .9 + (health < 30 && live ? .18 : 0) });
    updateCamera(dt);
    if (now - hudAt > 90) { hudAt = now; const c = cow.state;
      hud.speed.textContent = Math.round(Math.abs(c.speed) * 3.6) + ' km/h'; hud.charge.style.transform = `scaleX(${c.charge.toFixed(2)})`; hud.charge.parentElement.classList.toggle('full', c.charge > .97);
      hud.health.style.transform = `scaleX(${(health / 100).toFixed(2)})`;
      hud.goal.textContent = phase === 'intro' ? '' : !herd.free ? 'BREAK THE PEN GATE (SOUTH-EAST OF THE KILL FLOOR)' : `LEAD THE HERD OUT THE NORTH GATE · ${herd.saved}/${herd.count} OUT`;
      hud.count.textContent = `${farmers.out()} DOWN · ${stats.flips} FLIPPED`;
      if (message && now > messageUntil) { message = ''; $('cn-toast').classList.remove('show'); } }
    post.render();
  }
  addEventListener('resize', () => { renderer.setSize(container.clientWidth, container.clientHeight, false); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); });
  status.hidden = true; $('cn-gate').hidden = false;
  renderer.setAnimationLoop(frame);
  window.cowNinja = { cow, farmers, truck, herd, blood, world, physics, post, keys, stats, state: () => ({ phase, health, alarm, cow: { ...cow.state, forward: cow.state.forward.toArray(), velocity: cow.state.velocity.toArray() }, out: farmers.out(), flips: stats.flips, herdFree: herd.free, saved: herd.saved, blood: blood.inspect(), truckFlipped: truck.flipped }),
    begin: () => $('cn-enter').click(), step(n = 1, held = []) { for (const k of held) keys.add(k); for (let i = 0; i < n; i++) { cow.control(STEP, keys, phase !== 'play'); physics.step(STEP); cow.update(STEP); farmers.update(STEP, performance.now() / 1000, phase === 'play'); truck.update(STEP, phase === 'play'); herd.update(STEP, performance.now() / 1000); blood.update(STEP); world.update(0); } for (const k of held) keys.delete(k); return window.cowNinja.state(); } };
}

boot().catch(error => { console.error(error); const s = $('cn-status'); s.hidden = false; s.textContent = 'COWNinja could not start: ' + (error?.message || error); });
