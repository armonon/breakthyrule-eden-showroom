// COWNinja prototype: get the herd out of a working slaughterhouse. Ride in and smash the pen gate, or leave the cow,
// go in on foot (the main game's movement and parkour), take farmers down from behind, unlatch the pen and ride out.
// Its own page on the new renderer (three.js WebGPURenderer, WebGL2 fallback), sharing only the Jolt runtime with
// the rest of the game. Debug handle: window.cowNinja.
import * as THREE from 'three/webgpu';
import { createPhysics } from '/cowninja/physics.js';
import { loadAssets } from '/cowninja/assets.js';
import { createWorld } from '/cowninja/world.js';
import { createCow } from '/cowninja/cow.js';
import { createFarmers } from '/cowninja/farmers.js';
import { createTruck } from '/cowninja/truck.js';
import { createHerd } from '/cowninja/herd.js';
import { createBlood } from '/cowninja/blood.js';
import { createGrimPost } from '/cowninja/post.js';
import { createFoot } from '/cowninja/foot.js';
import { createAudio } from '/cowninja/audio.js';
import { createTouch } from '/cowninja/touch.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const STEP = 1 / 60;

async function boot() {
  const container = $('scene'), status = $('cn-status');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: query.get('webgl') === '1', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(container.clientWidth, container.clientHeight, false);
  container.append(renderer.domElement); await renderer.init();
  $('cn-backend').textContent = renderer.backend?.isWebGPUBackend ? 'WEBGPU' : 'WEBGL2';

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10151a); scene.fog = new THREE.FogExp2(0x12171c, .011);
  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, .1, 320);
  // The main game's character scripts take three as an argument; some of its helpers also look for the global.
  window.THREE ||= THREE;
  status.textContent = 'Loading the yard…';
  const [physics, assets] = await Promise.all([
    createPhysics(),
    loadAssets({ renderer, onProgress: (done, total, waiting = [], bytes = new Map()) => {
      // Name what is still coming, with megabytes for the big files, so a slow connection never looks like a hang.
      const mb = n => (n / 1048576).toFixed(1), big = waiting.filter(n => bytes.has(n)).map(n => `${n} ${mb(bytes.get(n)[0])}/${mb(bytes.get(n)[1])} MB`);
      const rest = waiting.length - big.length;
      status.textContent = `Loading the yard… ${Math.floor(done / total * 100)}%` + (waiting.length && waiting.length <= 6 ? ` · ${[...big, ...(rest ? [rest + ' more'] : [])].join(' · ')}` : big.length ? ` · ${big.join(' · ')}` : '');
    } }),
    // People: the Rocketbox meshes the farmers and the rider use, and the shared animation clips.
    // (never allowed to hold the page: after 30 s the game starts and they appear when they arrive)
    Promise.race([Promise.all([...['harbor', 'boulevard', 'coast', 'midnight'].map(id => window.GardenCharacterRocketbox?.load(id).catch(() => {})), Promise.resolve(window.GardenAnim?.load?.()).catch(() => {})]), new Promise(r => setTimeout(r, 30000))]).catch(() => {}),
  ]);
  const world = createWorld({ scene, physics, assets });
  const blood = createBlood({ scene });
  const audio = createAudio({ camera });
  const stats = { knockouts: 0, herdKnockouts: 0, flips: 0, hits: 0, start: 0, time: 0 };
  let health = 100, hurtFlash = 0, shake = 0, phase = 'intro', message = '', messageUntil = 0, alarm = false, alarmAt = 0, mode = 'foot', calling = 0, whistleAt = 0, takedowns = 0;
  const say = (text, seconds = 2.6) => { message = text; messageUntil = performance.now() + seconds * 1000; $('cn-toast').textContent = text; $('cn-toast').classList.toggle('long', text.length > 20); $('cn-toast').classList.add('show'); };

  const cow = createCow({ scene, physics, spawn: world.cowSpawn, assets }); cow.setRider(false);
  const foot = createFoot({ scene, world, onEffect: e => { if (e.kind === 'footstep:step') audio.hoof(...e.args); else if (e.kind === 'footstep:land') audio.land(...e.args); } });
  // Whoever the yard is reacting to: the cow while you ride it, the ninja while you are on foot.
  const actor = () => mode === 'foot' ? foot.state : cow.state;
  function damage(amount, dx, dz, push) {
    if (phase !== 'play') return; health = Math.max(0, health - amount); stats.hits++; hurtFlash = 1; shake = Math.max(shake, .5);
    const a = actor(); if (mode === 'ride') cow.hit(dx, dz, push); blood.burst(a.x, 1.2, a.z, dx * 4, dz * 4, 6); audio.hit('body', a.x, a.z, 1);
    if (health <= 0) end(false);
  }
  function raiseAlarm() { if (alarm) return; alarm = true; alarmAt = 0; truck.start(); audio.siren(6); }
  function onEvent(e) {
    if (e.type === 'knockout') {
      if (e.by === 'takedown') { takedowns++; say('TAKEN DOWN', 1.1); audio.hit('body', e.farmer.p.x, e.farmer.p.z, .7); return; }
      e.by === 'herd' ? stats.herdKnockouts++ : stats.knockouts++; shake = Math.max(shake, Math.min(.9, e.speed / 16)); if (e.by !== 'herd') say(e.speed > 13 ? 'FLATTENED' : 'KNOCKED OUT', 1.2);
      audio.hit(e.speed > 11 ? 'kill' : 'body', e.farmer.p.x, e.farmer.p.z, 1.2); audio.hit(Math.random() < .5 ? 'voice-a-death' : 'voice-b-death', e.farmer.p.x, e.farmer.p.z, .9); raiseAlarm();
    }
    // Seen: he shouts, and unless he is silenced in the next few seconds the alarm goes up.
    else if (e.type === 'spotted') { say('SPOTTED', 1.4); audio.hit(Math.random() < .5 ? 'voice-a-pain' : 'voice-b-pain', e.farmer.p.x, e.farmer.p.z, .8, .8); if (!alarm && !alarmAt) alarmAt = performance.now() + 4500; }
    else if (e.type === 'stabbed') damage(mode === 'foot' ? 19 : 11, e.dx, e.dz, 3.2);
    else if (e.type === 'run-over') { damage(Math.min(mode === 'foot' ? 70 : 40, (mode === 'foot' ? 30 : 14) + e.speed * 1.6), e.dx, e.dz, 7); audio.hit('metal', actor().x, actor().z, 1.2); }
    else if (e.type === 'rammed-truck') { shake = 1; say(e.square > .88 ? 'PERFECT ANGLE' : 'SIDE HIT', 1.4); audio.hit('metal', cow.state.x, cow.state.z, 1.4, .7); }
    else if (e.type === 'glanced') { shake = Math.max(shake, .35); audio.hit('metal', cow.state.x, cow.state.z, .7); }
    else if (e.type === 'flipped') { stats.flips++; say('TRUCK FLIPPED', 2); audio.hit('metal', cow.state.x, cow.state.z, 1.5, .55); }
    else if (e.type === 'truck-coming') say('THEY CALLED THE TRUCK', 2.4);
  }
  const farmers = createFarmers({ scene, physics, world, cow, blood, onEvent, target: actor });
  const truck = createTruck({ scene, physics, world, cow, blood, onEvent, assets, target: actor });
  const herd = createHerd({ scene, world, cow, farmers, assets });
  let quality = Number(query.get('q') ?? 0), post = createGrimPost({ renderer, scene, camera, occlusion: query.get('ao') !== '0' && quality < 2 });

  // Input. `keys` holds what is held; E (use) and Q (whistle) are single presses.
  const keys = new Set(), map = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space', KeyC: 'crouch', ControlLeft: 'crouch' };
  let camYaw = world.spawn.yaw, camPitch = -.12;
  addEventListener('keydown', e => {
    const k = map[e.code];
    if (!k) { if (e.repeat) return; if (e.code === 'KeyR' && phase !== 'intro') restart(); else if (e.code === 'KeyE') use(); else if (e.code === 'KeyQ') whistle(); return; }
    e.preventDefault(); if (k === 'space' && e.repeat) return; keys.add(k);
  });
  addEventListener('keyup', e => { const k = map[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());
  const look = (dx, dy) => { camYaw -= dx * .0024; camPitch = Math.max(-1.1, Math.min(.75, camPitch - dy * .002)); };
  renderer.domElement.addEventListener('click', () => { if (phase === 'play' && mode === 'foot' && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) look(e.movementX, e.movementY); });
  const touch = createTouch({ root: $('cn-touch'), keys, onAct: () => use(), onWhistle: () => whistle(), onLook: look });

  // What E would do right now, or null. Riding: get off. On foot: a takedown, the pen latch, or back on the cow.
  function option() {
    if (phase !== 'play') return null;
    if (mode === 'ride') return foot.available && Math.abs(cow.state.speed) < 5 && !cow.state.airborne ? { kind: 'dismount', label: 'GET OFF' } : null;
    const p = foot.state, near = farmers.nearest(p.x, p.z, 1.7);
    if (near && (near.behind || near.unaware)) return { kind: 'takedown', label: 'TAKE DOWN', farmer: near.farmer };
    if (!herd.free && Math.hypot(p.x - world.gatePost.x, p.z - world.gatePost.z) < 2.4) return { kind: 'latch', label: 'PULL THE LEVER' };
    if (Math.hypot(p.x - cow.state.x, p.z - cow.state.z) < 2.9) return { kind: 'mount', label: 'RIDE' };
    if (herd.free) { const other = herd.nearest(p.x, p.z, 2.6); if (other) return { kind: 'mount', label: 'RIDE', swap: other }; }
    return near ? { kind: 'none', label: 'HE SEES YOU' } : null;
  }
  function use() {
    const o = option(); if (!o) return;
    if (o.kind === 'dismount') {
      const c = cow.state, side = [[-1.35, 0], [1.35, 0], [0, 1.9]].map(([r, b]) => [c.x + Math.cos(c.yaw) * r - c.forward.x * b, c.z + Math.sin(c.yaw) * r - c.forward.z * b]).find(([x, z]) => !world.blocked(x, z, .4));
      if (!side) { say('NO ROOM TO GET OFF', 1.2); return; }
      camYaw = Math.PI - c.yaw; camPitch = -.15;
      if (!foot.enter(side[0], side[1], camYaw)) return;
      mode = 'foot'; cow.setRider(false); calling = 0; keys.delete('shift'); say('ON FOOT · C CROUCH · E USE · Q CALL THE COW', 3);
      if (!touch.active) renderer.domElement.requestPointerLock?.();
    } else if (o.kind === 'mount') { if (o.swap) herd.swap(o.swap, cow); mode = 'ride'; foot.leave(); cow.setRider(true); calling = 0; document.exitPointerLock?.(); audio.moo(.14); }
    else if (o.kind === 'takedown') { const f = o.farmer, p = foot.state, d = Math.hypot(f.p.x - p.x, f.p.z - p.z) || 1; foot.play('cross', { fade: .05, speed: 1.6, mask: 'upper' }); farmers.knock(f, (f.p.x - p.x) / d * 2.4, (f.p.z - p.z) / d * 2.4, 'takedown'); }
    else if (o.kind === 'latch') { world.openGate(); foot.play('interact', { fade: .08, mask: 'upper' }); audio.hit('wood', world.gatePost.x, world.gatePost.z, .8); }
  }
  // The whistle: on foot it brings the cow to you. Anyone close enough hears it too.
  function whistle() {
    const now = performance.now(); if (phase !== 'play' || now - whistleAt < 1500) return; whistleAt = now; audio.whistle();
    const a = actor(); farmers.noise(a.x, a.z, 15, .55);
    if (mode === 'foot' && herd.free) { calling = 14; say('CALLING A COW', 1.2); } else audio.moo(.2);
  }

  function end(won) {
    phase = won ? 'won' : 'lost'; stats.time = (performance.now() - stats.start) / 1000; document.exitPointerLock?.();
    const down = stats.knockouts + stats.herdKnockouts + takedowns, ghost = won && !alarm;
    $('cn-end-title').textContent = won ? (ghost ? 'GHOST · THE HERD IS OUT' : 'THE HERD IS OUT') : 'THEY GOT YOU';
    $('cn-end-body').textContent = won
      ? `${herd.saved} of ${herd.count} cows freed · ${down} farmers down (${takedowns} quietly, ${stats.herdKnockouts} by the stampede) · ${stats.flips} truck${stats.flips === 1 ? '' : 's'} flipped · ${stats.hits} hits taken · ${alarm ? 'alarm raised' : 'never seen'} · ${stats.time.toFixed(0)} s`
      : `${down} farmers down · ${stats.flips} truck${stats.flips === 1 ? '' : 's'} flipped · ${herd.free ? 'the herd was loose' : 'the herd is still penned'}`;
    $('cn-end').hidden = false;
  }
  function restart() { location.reload(); }
  $('cn-again').onclick = restart;
  $('cn-enter').onclick = () => { $('cn-gate').hidden = true; phase = 'play'; stats.start = performance.now(); renderer.domElement.focus(); audio.start(); foot.enter(world.spawn.x, world.spawn.z, world.spawn.yaw); if (!touch.active) renderer.domElement.requestPointerLock?.(); say('GET IN · PULL THE RED LEVER · RIDE A COW OUT', 5); };

  // Camera. Riding: behind and above, swinging wider and lower with speed. On foot: an orbit you steer with the mouse,
  // pulled in when a wall is in the way. Both are shaken by impacts.
  const camPos = new THREE.Vector3(world.spawn.x, 6, world.spawn.z - 9), camAim = new THREE.Vector3(), want = new THREE.Vector3();
  function updateCamera(dt) {
    const free = window.cowNinja?.freeCam; // debug: [x, y, z, lookX, lookY, lookZ] pins the camera for screenshots
    if (free) { camera.position.set(free[0], free[1], free[2]); camera.lookAt(free[3], free[4], free[5]); return; }
    let fov = 62;
    if (mode === 'foot') {
      const p = foot.state, eye = p.y + (p.crouched ? 1.05 : 1.5), cp = Math.cos(camPitch), dx = Math.sin(camYaw) * cp, dy = Math.sin(camPitch), dz = Math.cos(camYaw) * cp;
      let reach = 3.7; for (let d = .5; d <= 3.7; d += .25) if (world.solidAt(p.x - dx * d, eye - dy * d + .25, p.z - dz * d, .2)) { reach = Math.max(.5, d - .3); break; }
      want.set(p.x - dx * reach, Math.max(.35, eye - dy * reach + .3), p.z - dz * reach); { const ceiling = Math.min(world.ceilingAt(want.x, want.z), world.ceilingAt(p.x, p.z)); if (p.y < ceiling - .5 && want.y > ceiling - .35) want.y = ceiling - .35; }
      camPos.lerp(want, 1 - Math.exp(-18 * dt)); camAim.set(p.x + dx * 4, eye + dy * 4 + .1, p.z + dz * 4); fov = 64 + Math.min(10, p.speed * 1.2);
    } else {
      const c = cow.state, fast = Math.min(1, Math.abs(c.speed) / cow.TUNE.charge), back = 6.2 + fast * 2.6, up = 3.3 - fast * .9;
      want.set(c.x - c.forward.x * back, c.y + up, c.z - c.forward.z * back);
      camPos.lerp(want, 1 - Math.exp(-(3.2 + fast * 2) * dt)); if (camPos.y < .6) camPos.y = .6;
      // Under the roof the high chase view would sit above the ceiling: keep it below.
      { const ceiling = world.ceilingAt(camPos.x, camPos.z), under = world.ceilingAt(c.x, c.z); if (Math.min(ceiling, under) < Infinity) camPos.y = Math.min(camPos.y, Math.min(ceiling, under) - .45); }
      camAim.set(c.x + c.forward.x * (2.5 + fast * 4), c.y + 1.35, c.z + c.forward.z * (2.5 + fast * 4)); fov = 62 + fast * 16 + c.charge * 5;
    }
    shake = Math.max(0, shake - dt * 2.4);
    camera.position.copy(camPos); if (shake > 0) camera.position.add(want.set((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(shake * .35));
    camera.lookAt(camAim);
    if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  }

  // One 60 Hz tick of everything that must not depend on the frame rate.
  const none = new Set();
  function tick(live) {
    if (mode === 'ride') cow.control(STEP, keys, !live);
    else { cow.control(STEP, calling > 0 && live ? cow.steerTo(foot.state.x, foot.state.z) : none, !live); if (live) foot.step(keys, camYaw, camPitch); }
    physics.step(STEP);
  }
  // Slow machines: step the picture down (resolution, then the ambient occlusion pass, then shadows) until it holds.
  let slow = 0, measured = 0, measureFrom = 0;
  function tune(dt, now) {
    if (phase !== 'play' || quality >= 3 || query.has('q')) return;
    if (!measureFrom) measureFrom = now + 2500; if (now < measureFrom) return;
    slow += dt; measured++;
    if (measured < 90) return;
    const average = slow / measured; slow = 0; measured = 0;
    if (average < .03) return;
    quality++; measureFrom = now + 1500;
    if (quality === 1) renderer.setPixelRatio(1);
    else if (quality === 2) { post.dispose(); post = createGrimPost({ renderer, scene, camera, occlusion: false }); }
    else { renderer.setPixelRatio(.75); scene.traverse(o => { if (o.isLight && o.castShadow && o.shadow.mapSize.x > 1024) { o.shadow.mapSize.set(1024, 1024); o.shadow.map?.dispose(); o.shadow.map = null; } }); } // shadows stay: without the moon's, it shines through the roof
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }

  const mark = new THREE.Vector3();
  const hud = { marker: $('cn-marker'), speed: $('cn-speed'), charge: $('cn-charge-fill'), health: $('cn-health-fill'), goal: $('cn-goal'), count: $('cn-count'), prompt: $('cn-prompt'), seen: $('cn-seen-fill'), stealth: $('cn-stealth'), keys: $('cn-keys-text') };
  let last = performance.now(), acc = 0, hudAt = 0, beat = 0, lastGate = false;
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
    const live = phase === 'play';
    let steps = 0;
    while (acc >= STEP && steps < 4) { tick(live); acc -= STEP; steps++; }
    if (steps === 4) acc = 0;
    const time = now / 1000, a = actor();
    cow.update(dt); world.update(time, a); farmers.update(dt, time, live); truck.update(dt, live); herd.update(dt, time); blood.update(dt);
    if (calling > 0) { calling -= dt; if (Math.hypot(cow.state.x - foot.state.x, cow.state.z - foot.state.z) < 3) calling = 0; }
    // Hooves: four beats a stride, louder and harder the faster it goes.
    { const b = Math.floor(cow.state.gait * 4); if (b !== beat) { beat = b; const v = Math.abs(cow.state.speed); if (v > .6 && !cow.state.airborne) { const d = Math.hypot(cow.state.x - a.x, cow.state.z - a.z); if (d < 30) audio.hoof(world.indoors(cow.state.x, cow.state.z) ? 'stone' : 'grass', Math.min(6, 2 + v * .3)); } } }
    { const t = truck.body.read().p; audio.truck(truck.speed, Math.hypot(t[0] - a.x, t[2] - a.z), truck.active && !truck.flipped); }
    if (live) {
      const broken = world.gateBroken();
      if (!herd.free && broken) { herd.release(); audio.moo(.25); if (mode === 'ride') { raiseAlarm(); audio.hit('wood', 8, 36, 1.3); say('THE GATE IS DOWN · LEAD THEM NORTH', 3.5); } else say('THE PEN IS OPEN · RIDE ONE OUT THE NORTH GATE', 4); }
      lastGate = broken;
      if (alarmAt && now > alarmAt) { if (farmers.alerted()) raiseAlarm(); else alarmAt = 0; }
      // Won: you are out past the north gate and at least half the herd has followed.
      if (herd.free && a.z < world.gateZ - 2 && herd.saved >= Math.ceil(herd.count / 2)) end(true);
    }
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6); post.set({ hurt: hurtFlash * .9 + (health < 30 && live ? .18 : 0) });
    updateCamera(dt); tune(dt, now);
    // The objective marker: a diamond over the lever, then your cow, then the way out; pinned to the screen edge when off it.
    { const m = hud.marker, target = !live ? null : !herd.free ? [world.gatePost.x, 2.6, world.gatePost.z] : mode === 'foot' ? [cow.state.x, 2.2, cow.state.z] : [world.exit.x, 3, world.exit.z + 4];
      if (!target || window.cowNinja?.freeCam) m.hidden = true; else {
        mark.set(target[0], target[1], target[2]); const far = Math.hypot(target[0] - a.x, target[2] - a.z); mark.project(camera);
        const behind = mark.z > 1; let sx = mark.x, sy = mark.y; if (behind) { sx = -sx; sy = -1; }
        const k = Math.max(Math.abs(sx) / .92, Math.abs(sy) / .86, 1); sx /= k; sy /= k;
        m.hidden = false; m.style.transform = `translate(${((sx * .5 + .5) * container.clientWidth).toFixed(1)}px, ${((-sy * .5 + .5) * container.clientHeight).toFixed(1)}px)`; m.dataset.edge = k > 1 || behind ? '1' : '0'; m.lastChild.textContent = Math.round(far) + ' m'; } }
    if (now - hudAt > 90) { hudAt = now; const c = cow.state, level = farmers.alertLevel(), o = option();
      hud.speed.textContent = Math.round((mode === 'foot' ? foot.state.speed : Math.abs(c.speed)) * 3.6) + ' km/h'; hud.charge.style.transform = `scaleX(${(mode === 'foot' ? 0 : c.charge).toFixed(2)})`; hud.charge.parentElement.classList.toggle('full', mode === 'ride' && c.charge > .97);
      hud.health.style.transform = `scaleX(${(health / 100).toFixed(2)})`;
      hud.goal.textContent = phase === 'intro' ? '' : !herd.free ? (mode === 'foot' ? 'PULL THE RED LEVER BY THE PEN' : 'BREAK THE PEN GATE') : mode === 'foot' ? 'GET ON A COW (E) · Q CALLS ONE' : `LEAD THE HERD OUT THE NORTH GATE · ${herd.saved}/${herd.count} OUT`;
      hud.count.textContent = `${farmers.out()} DOWN · ${stats.flips} FLIPPED`;
      hud.seen.style.transform = `scaleX(${level.toFixed(2)})`; hud.stealth.textContent = alarm ? 'ALARM' : level >= 1 ? 'SPOTTED' : level > .3 ? 'SUSPICIOUS' : 'HIDDEN'; hud.stealth.parentElement.dataset.state = alarm || level >= 1 ? 'hot' : level > .3 ? 'warm' : 'cold';
      hud.prompt.textContent = o ? (o.kind === 'none' ? o.label : `${touch.active ? 'USE' : 'E'} · ${o.label}`) : ''; hud.prompt.classList.toggle('show', !!o);
      if (hud.keys.dataset.mode !== mode) hud.keys.dataset.mode = mode;
      if (message && now > messageUntil) { message = ''; $('cn-toast').classList.remove('show'); } }
    post.render();
  }
  addEventListener('resize', () => { renderer.setSize(container.clientWidth, container.clientHeight, false); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); });
  status.hidden = true; $('cn-gate').hidden = false;
  renderer.setAnimationLoop(frame);
  window.cowNinja = { assets, renderer, scene, camera, cow, foot, farmers, truck, herd, blood, world, physics, audio, keys, stats, use, whistle, look, option,
    get post() { return post; }, get mode() { return mode; }, set yaw(v) { camYaw = v; }, get yaw() { return camYaw; },
    state: () => ({ phase, mode, health, alarm, quality, takedowns, level: farmers.alertLevel(), option: option()?.kind || null, cow: { ...cow.state, forward: cow.state.forward.toArray(), velocity: cow.state.velocity.toArray() }, foot: { ...foot.state, forward: foot.state.forward.toArray(), velocity: foot.state.velocity.toArray() }, out: farmers.out(), flips: stats.flips, herdFree: herd.free, saved: herd.saved, blood: blood.inspect(), truckFlipped: truck.flipped }),
    begin: () => $('cn-enter').click(),
    // Advance n ticks with these keys held (headless testing): the same order as a real frame.
    step(n = 1, held = []) { for (const k of held) keys.add(k); const t = performance.now() / 1000; for (let i = 0; i < n; i++) { const live = phase === 'play'; tick(live); cow.update(STEP); farmers.update(STEP, t + i * STEP, live); truck.update(STEP, live); herd.update(STEP, t + i * STEP); blood.update(STEP); world.update(0, actor()); if (live && !herd.free && world.gateBroken()) herd.release(); } for (const k of held) keys.delete(k); return this.state(); } };
}

boot().catch(error => { console.error(error); const s = $('cn-status'); s.hidden = false; s.textContent = 'COWNinja could not start: ' + (error?.message || error); });
