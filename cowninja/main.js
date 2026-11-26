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
import { TUNE } from '/cowninja/config.js';
import { createBlasts } from '/cowninja/blasts.js';
import { createPolice } from '/cowninja/police.js';
import { createBlood } from '/cowninja/blood.js';
import { createGrimPost } from '/cowninja/post.js';
import { createFoot } from '/cowninja/foot.js';
import { createAudio } from '/cowninja/audio.js';
import { createTouch } from '/cowninja/touch.js';
import { createFight } from '/cowninja/fight.js';
import { pairedAnchor } from '/cowninja/animation-path.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const STEP = 1 / 60;

async function boot() {
  const container = $('scene'), status = $('cn-status');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: query.get('webgl') === '1', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.35;
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
  const world = createWorld({ scene, physics, assets, shadows: query.has('sh') ? Number(query.get('sh')) : matchMedia?.('(pointer: coarse)').matches ? 2 : 7 });
  const blood = createBlood({ scene });
  const audio = createAudio({ camera });
  const stats = { knockouts: 0, herdKnockouts: 0, flips: 0, hits: 0, start: 0, time: 0, thrown: 0 };
  let hitStopUntil = 0;
  let health = 100, hurtFlash = 0, shake = 0, phase = 'intro', message = '', messageUntil = 0, alarm = false, alarmAt = 0, mode = 'foot', calling = 0, whistleAt = 0, takedowns = 0;
  const say = (text, seconds = 2.6) => { message = text; messageUntil = performance.now() + seconds * 1000; $('cn-toast').textContent = text; $('cn-toast').classList.toggle('long', text.length > 20); $('cn-toast').classList.add('show'); };

  const cow = createCow({ scene, physics, spawn: world.cowSpawn, assets }); cow.setRider(false);
  const foot = createFoot({ scene, world, onEffect: e => { if (e.kind === 'footstep:step') audio.hoof(...e.args); else if (e.kind === 'footstep:land') audio.land(...e.args); else if (e.kind === 'leap-of-faith') { say('LEAP OF FAITH', 1.4); audio.land('grass', 1); } } });
  // Whoever the yard is reacting to: the cow while you ride it, the ninja while you are on foot.
  const actor = () => mode === 'foot' ? foot.state : cow.state;
  function damage(amount, dx, dz, push) {
    if (phase !== 'play' || window.cowNinja?.god || performance.now() < graceUntil) return; health = Math.max(0, health - amount); kick(dx || 0, dz || 0, Math.min(.6, amount * .02)); stats.hits++; hurtFlash = 1; shake = Math.max(shake, .5);
    if (mode === 'foot') foot.cancelAction();
    const a = actor(); if (mode === 'ride') cow.hit(dx, dz, push); blood.burst(a.x, 1.2, a.z, dx * 4, dz * 4, 6); audio.hit('body', a.x, a.z, 1);
    if (mode === 'ride' && health > 0 && amount >= TUNE.rider.throwDamage) throwOff(dx, dz, 'THROWN OFF · E ON ANY COW TO RIDE AGAIN');
    if (health <= 0) end(false);
  }
  // Thrown from the cow: you land beside it and carry on on foot. A moment's grace to find your feet; the cow bolts
  // a short way (whistle brings it back), and everything you could do before you can still do.
  let graceUntil = 0, bolt = null;
  function throwOff(dx, dz, text) {
    if (mode !== 'ride' || !foot.available) return false;
    const c = cow.state, spot = [[dx * 1.8, dz * 1.8], [-1.5, 0], [1.5, 0], [0, 1.9], [0, -1.9]].map(([ox, oz]) => [c.x + ox, c.z + oz]).find(([x, z]) => !world.blocked(x, z, .4));
    if (!spot) return false;
    const yaw = Math.PI - c.yaw; if (!foot.enter(spot[0], spot[1], yaw)) return false;
    mode = 'foot'; cow.setRider(false); calling = 0; keys.delete('shift'); camEase = 1.2; rig.wideUntil = performance.now() + 2500;
    // Face where help is: the herd if there is one nearby, else the cow that threw you.
    { const list = herd.cows.filter(o => o.state === 'free'); let tx = c.x, tz = c.z; if (list.length) { tx = 0; tz = 0; for (const o of list) { tx += o.p.x; tz += o.p.z; } tx /= list.length; tz /= list.length; }
      camYaw = Math.hypot(tx - spot[0], tz - spot[1]) > 2 ? Math.atan2(tx - spot[0], tz - spot[1]) : yaw; camPitch = -.22; } graceUntil = performance.now() + TUNE.rider.recoverGrace * 1000;
    // The cow runs from what threw you, as far as there is open ground.
    { let far = 3; const bx = -dx || c.forward.x, bz = -dz || c.forward.z, l = Math.hypot(bx, bz) || 1; while (far < TUNE.rider.boltDistance && !world.blocked(c.x + bx / l * (far + 1), c.z + bz / l * (far + 1), 1)) far += 1;
      bolt = { x: c.x + bx / l * far, z: c.z + bz / l * far, until: performance.now() + TUNE.rider.boltSeconds * 1000 }; }
    stats.thrown++; say(text, 3.2); return true;
  }
  // ---- how they answer. Awareness is the alarm and what each of them has seen; aggression is a running total of the
  // harm you and your herd have done. Police come after an alarm; the harsher stages come only from aggression.
  const response = { aggression: 0, stage: 0, calledAt: 0, reasons: [] }, STAGES = ['QUIET', 'SUSPICION', 'ALARM', 'POLICE', 'PURSUIT', 'HEAVY RESPONSE'];
  function provoke(kind, why) { const w = TUNE.response.weights[kind] || 0; if (!w || phase !== 'play') return; response.aggression += w; response.reasons.push(why || kind); }
  function updateResponse(now, level) {
    const R = TUNE.response; let stage = alarm ? 2 : level > .3 ? 1 : 0;
    if (alarm && now > response.calledAt + R.policeDelay * 1000) stage = response.aggression >= R.heavy ? 5 : response.aggression >= R.aggressive ? 4 : 3;
    if (response.stage >= 3) stage = Math.max(stage, response.stage);   // once the police are in it they stay in it
    while (response.stage < stage && stage >= 3) {
      const next = Math.max(3, response.stage + 1); response.stage = next;
      if (next === 3) { police.arrive('police', R.waves.police); say('POLICE ON THE ROAD · THEY WILL BLOCK THE WAY OUT', 4); }
      else if (next === 4) { police.arrive('police', R.waves.aggressive); say('YOU HURT PEOPLE · MORE POLICE, AND THEY SHOOT FIRST', 4); }
      else if (next === 5) { police.arrive('heavy', R.waves.heavy); say('HEAVY UNITS · EXPLOSIVES · KEEP MOVING, USE COVER', 5); }
    }
    if (stage < 3) response.stage = stage;
  }
  let bodyAlarm = null;
  function raiseAlarm(why) { if (alarm) return; alarm = true; alarmAt = 0; response.calledAt = performance.now(); truck.start(); audio.siren(6); if (why) say(why, 3); }
  function onEvent(e) {
    if (e.type === 'knockout') {
      if (e.by === 'blast') { stats.knockouts++; return; }   // their own bomb: not yours to answer for
      if (e.by === 'fists') { provoke('assault', 'assault'); stats.knockouts++; audio.hit('kill', e.farmer.p.x, e.farmer.p.z, 1.1); audio.hit(Math.random() < .5 ? 'voice-a-death' : 'voice-b-death', e.farmer.p.x, e.farmer.p.z, .9); farmers.noise(e.farmer.p.x, e.farmer.p.z, 12, .6); return; }
      if (e.by === 'takedown') { takedowns++; say('TAKEN DOWN', 1.1); audio.hit('body', e.farmer.p.x, e.farmer.p.z, .7); return; }
      provoke(e.by === 'herd' ? 'herdTrample' : 'trample', 'trampled'); e.by === 'herd' ? stats.herdKnockouts++ : stats.knockouts++; shake = Math.max(shake, Math.min(.9, e.speed / 16)); if (e.by !== 'herd') say(e.speed > 13 ? 'FLATTENED' : 'KNOCKED OUT', 1.2);
      audio.hit(e.speed > 11 ? 'kill' : 'body', e.farmer.p.x, e.farmer.p.z, 1.2); audio.hit(Math.random() < .5 ? 'voice-a-death' : 'voice-b-death', e.farmer.p.x, e.farmer.p.z, .9); raiseAlarm();
    }
    // Seen: he shouts, and unless he is silenced in the next few seconds the alarm goes up.
    else if (e.type === 'spotted' && e.farmer.role === 'worker') { say('A WORKER SAW YOU · HE IS RUNNING TO REPORT IT', 3); audio.hit(Math.random() < .5 ? 'voice-a-pain' : 'voice-b-pain', e.farmer.p.x, e.farmer.p.z, .8, 1.1); }
    else if (e.type === 'reported') raiseAlarm('REPORTED · THE ALARM IS UP');
    else if (e.type === 'body-found') { say('A BODY HAS BEEN FOUND', 2.4); if (!alarm && !bodyAlarm) bodyAlarm = { farmer: e.farmer, at: performance.now() + 6000 }; }
    else if (e.type === 'aiming') window.EdenMelee?.sound('glint', .7);
    else if (e.type === 'shot') { const f = e.farmer, a = actor(); audio.hit('metal', f.p.x, f.p.z, 1.3, 1.9); tracer.fire(f.p.x, f.p.z, a.x + (e.hit ? 0 : -e.dz * 1.2), a.z + (e.hit ? 0 : e.dx * 1.2), a.y || 0);
      if (e.hit) { const through = mode === 'foot' ? Math.max(fight.raised?.() ? .6 : 1, 0) : 1; damage((mode === 'foot' ? TUNE.staff.pistol.damageFoot : TUNE.staff.pistol.damageRide) * through, e.dx, e.dz, 2); } }
    else if (e.type === 'lob') blasts.spawn(e.x, e.z);
    else if (e.type === 'police-coming') { /* the siren says it */ }
    else if (e.type === 'police-arrived') rig.wideUntil = performance.now() + 3500, say(e.role === 'heavy' ? 'HEAVY UNITS ARE OUT OF THE TRUCK' : `${e.count} POLICE BEYOND THE GATE`, 2.6);
    else if (e.type === 'police-car-hit') { provoke('policeVehicle', 'police car'); shake = Math.max(shake, .7); audio.hit('metal', e.x, e.z, 1.4, .6); say('A POLICE CAR IS HIT · THEY WILL ANSWER FOR IT', 2.6); }
    else if (e.type === 'spotted') { say('SPOTTED', 1.4); audio.hit(Math.random() < .5 ? 'voice-a-pain' : 'voice-b-pain', e.farmer.p.x, e.farmer.p.z, .8, .8); if (!alarm && !alarmAt) alarmAt = performance.now() + 4500; }
    else if (e.type === 'windup') window.EdenMelee?.sound('glint', .8);
    // A farmer's blow: on foot it meets your guard first (parried: nothing; blocked: a chip; else all of it).
    else if (e.type === 'stabbed') { const through = mode === 'foot' ? fight.incoming(e) : 1; if (through > 0) damage((mode === 'foot' ? 19 : 11) * through, e.dx, e.dz, 3.2); }
    else if (e.type === 'run-over') { damage(Math.min(mode === 'foot' ? 70 : 40, (mode === 'foot' ? 30 : 14) + e.speed * 1.6), e.dx, e.dz, 7); audio.hit('metal', actor().x, actor().z, 1.2); }
    else if (e.type === 'rammed-truck') { shake = 1; say(e.square > .88 ? 'PERFECT ANGLE' : 'SIDE HIT', 1.4); audio.hit('metal', cow.state.x, cow.state.z, 1.4, .7); }
    else if (e.type === 'glanced') { shake = Math.max(shake, .35); audio.hit('metal', cow.state.x, cow.state.z, .7); }
    else if (e.type === 'flipped') { provoke('vehicle', 'truck'); stats.flips++; say('TRUCK FLIPPED', 2); audio.hit('metal', cow.state.x, cow.state.z, 1.5, .55); }
    else if (e.type === 'truck-coming') say('THEY CALLED THE TRUCK', 2.4);
  }
  const farmers = createFarmers({ scene, physics, world, cow, blood, onEvent, target: actor });
  const truck = createTruck({ scene, physics, world, cow, blood, onEvent, assets, target: actor });
  // The herd reports what happens to it: cows freed, blows on a gate, a gate that gives or holds, cows made safe.
  let cine = null, lastSaveAt = 0, commandAt = -1e9;
  function onHerd(e) {
    if (e.type === 'released') { audio.moo(.25); say(`${e.count} COWS FREE · ${herd.freeCount} IN THE HERD · F SENDS THEM · Q CALLS THEM`, 4); }
    else if (e.type === 'charge') { audio.moo(.3); say('CHARGE', 1.2); }
    else if (e.type === 'thud') { audio.hit(e.gate.kind === 'main' ? 'metal' : 'wood', e.gate.x, e.gate.z, Math.min(1.4, .5 + e.power / 14)); shake = Math.max(shake, Math.min(.5, e.sum / e.need * .45)); }
    else if (e.type === 'break') {
      rig.wideUntil = performance.now() + 3000;
      audio.hit('metal', e.gate.x, e.gate.z, 1.6, .6); audio.moo(.35); shake = 1; hitStopUntil = performance.now() + 90; raiseAlarm(); provoke('gate', 'gate');
      say(e.gate.kind === 'main' ? 'THE MAIN GATE IS DOWN · RUN' : 'THE GATE GIVES', 2.6);
      // A short look at the breakthrough from beyond the gate. Any input takes the camera back.
      if (cinematic) { const d = e.gate.n, tx = -d[1], tz = d[0]; cine = { until: performance.now() + 1700, pos: [e.gate.x + d[0] * 9 + tx * 5, 2.6, e.gate.z + d[1] * 9 + tz * 5], aim: [e.gate.x, 1.2, e.gate.z] }; }
    }
    else if (e.type === 'bounce') say(`THE GATE HELD · ${Math.round(e.power)} OF ${e.need} FORCE · MORE COWS, MORE RUN-UP, TOGETHER`, 4);
    else if (e.type === 'saved') lastSaveAt = performance.now();
    else if (e.type === 'cow-lost') { blood.burst(e.x, 1, e.z, 0, 0, 22); blood.splat?.(e.x, e.z, 1.6); }
  }
  const herd = createHerd({ scene, world, cow, farmers, assets, leader: actor, onEvent: onHerd });
  farmers.setNav(herd.nav);
  const police = createPolice({ scene, physics, assets, farmers, herd, cow, audio, onEvent });
  // A pistol shot: a streak from the muzzle to where the round went.
  const tracer = (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: .9 })); m.visible = false; scene.add(m); let until = 0;
    return { fire(x0, z0, x1, z1, y) { const d = Math.hypot(x1 - x0, z1 - z0) || 1; m.position.set((x0 + x1) / 2, 1.35 + y * .5, (z0 + z1) / 2); m.scale.set(.025, .025, d); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); m.visible = true; until = performance.now() + 70; }, update(now) { if (m.visible && now > until) m.visible = false; } }; })();
  // Explosives. Whoever the blast reaches with nothing solid in between is hit. Riding: the first such blast shakes
  // you, and a second while you are still shaken throws you, whatever your health. A blast you dodged counts for nothing.
  let shaken = false, shakenAt = 0, threatAt = 0;
  const blasts = createBlasts({ scene, audio, onBlast(b) {
    const a = actor(), dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1, now = performance.now(), covered = (x, z) => !!world.sightBlocked(b.x, b.z, x, z);
    if (d < TUNE.blast.threatRange) threatAt = now;
    shake = Math.max(shake, Math.min(1, 9 / d));
    for (const f of farmers.standing()) { const fd = Math.hypot(f.p.x - b.x, f.p.z - b.z) || 1; if (fd < b.radius * .7 && !covered(f.p.x, f.p.z)) farmers.knock(f, (f.p.x - b.x) / fd * 7, (f.p.z - b.z) / fd * 7, 'blast'); }
    const r = herd.blast(b.x, b.z, { covered, time: now / 1000 });
    if (r.killed) say(`${r.killed} COW${r.killed > 1 ? 'S' : ''} LOST TO THE BLAST · ${herd.lost} LOST IN ALL`, 3);
    if (phase !== 'play' || d >= b.radius || covered(a.x, a.z)) return;   // missed you, or you were behind something
    const k = 1 - d / b.radius * .6;
    if (mode === 'ride') {
      if (shaken && now - shakenAt > 350) { shaken = false; stats.blasted = (stats.blasted || 0) + 1; throwOff(dx / d, dz / d, 'THE BLAST THREW YOU · ON FOOT NOW · Q CALLS THE HERD'); herd.blast(a.x, a.z, { lethal: 0, time: now / 1000 }); damage(TUNE.blast.damageRide * k, dx / d, dz / d, 0); }
      else if (!shaken) { shaken = true; shakenAt = now; cow.hit(dx / d, dz / d, 5); damage(TUNE.blast.damageRide * k, dx / d, dz / d, 2); say('SHAKEN · ONE MORE BLAST THROWS YOU · GET CLEAR', 3.5); audio.moo(.4); }
    } else damage(TUNE.blast.damageFoot * k, dx / d, dz / d, 0);
  } });
  // Where the herd has been sent: a ring on the ground (green: go and hold; red: charge this gate).
  const orderMark = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 40), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: .9, depthTest: false, side: THREE.DoubleSide }));
  orderMark.rotation.x = -Math.PI / 2; orderMark.renderOrder = 5; orderMark.visible = false; scene.add(orderMark);
  const aimMark = new THREE.Group(); aimMark.visible = false; scene.add(aimMark);
  { const glow = new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: .85, depthTest: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .7, 36), glow); ring.rotation.x = -Math.PI / 2; ring.position.y = .14; ring.renderOrder = 6;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: .45, depthWrite: false }));
    beam.position.y = 1.5; aimMark.add(ring, beam); aimMark.userData = { ring, beam }; }
  let cinematic = query.get('cine') !== '0', view = 'auto', wide = 0, camEase = 0;
  // Camera state beyond position: the rider's orbit (right-drag or touch-drag while riding; eases back behind the cow
  // once you let go), zoom (mouse wheel), a spring for the chase view, a dip on landings, a kick from blows, a roll
  // into turns, and framing requests (close for a takedown or a lever, wide when the police arrive or a gate goes).
  const rig = { orbitYaw: 0, orbitPitch: 0, orbitIdle: 9, zoom: 1, vel: new THREE.Vector3(), dip: 0, dipV: 0, kick: new THREE.Vector3(), roll: 0, lastYaw: 0, closeUntil: 0, wideUntil: 0, airFoot: false, airCow: false };
  const kick = (dx, dz, amount) => { rig.kick.x += dx * amount; rig.kick.z += dz * amount; rig.kick.y -= amount * .3; };
  // Aiming a herd order: hold F, a cursor shows where it will land and what it will do; let go to give it.
  const aim = { on: false, at: 0, x: 0, z: 0, check: null, checkedAt: 0 };
  // Fists (Break Thy Rule's melee core): hit-stop freezes the game for a few frames, slow motion stretches a finisher.
  const fight = createFight({ foot, farmers, hooks: { yaw: () => camYaw, shake: a => { shake = Math.max(shake, a * 1.6); }, hitStop: ms => { hitStopUntil = performance.now() + ms; },
    onHit: ({ farmer }) => { audio.hit('body', farmer.p.x, farmer.p.z, 1); farmers.noise(farmer.p.x, farmer.p.z, 9, .35); } } });
  // Phones and tablets start without reflections and occlusion; desktops get everything and step down if slow.
  const handheld = matchMedia?.('(pointer: coarse)').matches;
  let quality = Number(query.get('q') ?? (handheld ? 2 : 0)), post = createGrimPost({ renderer, scene, camera, level: quality, occlusion: query.get('ao') !== '0' });

  // Input. `keys` holds what is held; E (use) and Q (whistle) are single presses.
  const keys = new Set(), map = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space', KeyC: 'crouch', ControlLeft: 'crouch' };
  let camYaw = world.spawn.yaw, camPitch = -.12;
  addEventListener('keydown', e => {
    const k = map[e.code];
    if (!k) { if (e.repeat) return; if (e.code === 'KeyR' && phase !== 'intro') restart(); else if (e.code === 'KeyE') use(); else if (e.code === 'KeyQ') whistle(); else if (e.code === 'KeyF') { if (phase === 'play') { aim.on = true; aim.at = performance.now(); aim.checkedAt = 0; } } else if (e.code === 'KeyV') cycleView(); return; }
    e.preventDefault(); if (k === 'space' && e.repeat) return; keys.add(k);
  });
  addEventListener('keyup', e => { const k = map[e.code]; if (k) keys.delete(k); if (e.code === 'KeyF' && aim.on) { aim.on = false; commandAt2D(pointer.x, pointer.y); } });
  // Riding, the mouse is free (click gives orders): drag with the right button to look round; the wheel zooms.
  let orbitDrag = false;
  renderer.domElement.addEventListener('mousedown', e => { if (e.button === 2 && mode === 'ride') orbitDrag = true; });
  addEventListener('mouseup', e => { if (e.button === 2) orbitDrag = false; });
  addEventListener('mousemove', e => { if (orbitDrag && mode === 'ride') look(e.movementX, e.movementY); });
  renderer.domElement.addEventListener('wheel', e => { rig.zoom = Math.max(.6, Math.min(1.9, rig.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08))); e.preventDefault(); }, { passive: false });
  addEventListener('keydown', e => { if (!e.repeat) cine = null; }); addEventListener('pointerdown', () => { cine = null; });
  // Herd orders. F (or a click while riding, or a tap on a touch screen) sends the herd to the spot under the cursor
  // (the middle of the screen while the mouse is steering the camera); on a closed gate it means "charge it".
  const pointer = { x: 0, y: 0 }, ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPoint = new THREE.Vector3();
  addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) { pointer.x = 0; pointer.y = 0; } else { const b = renderer.domElement.getBoundingClientRect(); pointer.x = (e.clientX - b.left) / b.width * 2 - 1; pointer.y = -((e.clientY - b.top) / b.height * 2 - 1); } });
  function commandAt2D(sx, sy) {
    if (phase !== 'play') return null;
    ray.setFromCamera({ x: sx, y: sy }, camera);
    if (!ray.ray.intersectPlane(ground, hitPoint) || hitPoint.distanceTo(camera.position) > 140) { hitPoint.copy(ray.ray.direction).setY(0).normalize().multiplyScalar(60).add(camera.position).setY(0); }
    return command(hitPoint.x, hitPoint.z);
  }
  function command(x, z) {
    const r = herd.command(x, z);
    if (!r.ok) { say(`${r.reason} · THE HERD KEEPS ITS ORDER`, 2.2); audio.hit('wood', actor().x, actor().z, .35, 1.6); orderFlash = performance.now(); return r; }
    commandAt = performance.now(); audio.whistle(); farmers.noise(actor().x, actor().z, 10, .35);
    say(r.type === 'charge' ? `HERD · CHARGE THE ${r.gate.kind === 'main' ? 'MAIN ' : ''}GATE · ${r.outlook.verdict}` : 'HERD · GO THERE AND HOLD', 2);
    return r;
  }
  let orderFlash = 0;
  function cycleView() { view = view === 'auto' ? 'herd' : view === 'herd' ? 'close' : 'auto'; say(view === 'herd' ? 'CAMERA · HERD VIEW' : view === 'close' ? 'CAMERA · CLOSE' : 'CAMERA · AUTO', 1.2); }
  renderer.domElement.addEventListener('click', e => { if (phase === 'play' && mode === 'ride') { const b = renderer.domElement.getBoundingClientRect(); commandAt2D((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height * 2 - 1)); } });
  { let tap = null; const el = document.getElementById('scene') || renderer.domElement;
    el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', e => { if (!tap || e.pointerId !== tap.id) return; const quick = performance.now() - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12; tap = null;
      if (quick) { const b = renderer.domElement.getBoundingClientRect(); commandAt2D((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height * 2 - 1)); } }); }
  addEventListener('blur', () => keys.clear());
  const look = (dx, dy) => {
    if (mode === 'ride') { rig.orbitYaw = Math.max(-2.6, Math.min(2.6, rig.orbitYaw - dx * .004)); rig.orbitPitch = Math.max(-.35, Math.min(.6, rig.orbitPitch - dy * .003)); rig.orbitIdle = 0; return; }
    camYaw -= dx * .0024; camPitch = Math.max(-1.1, Math.min(.75, camPitch - dy * .002)); };
  renderer.domElement.addEventListener('click', () => { if (phase === 'play' && mode === 'foot' && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) look(e.movementX, e.movementY); });
  // Fists: left mouse (or J) punches, tap for jab/cross and hold for the haymaker; right mouse (or K) guards.
  const fighting = () => phase === 'play' && mode === 'foot';
  renderer.domElement.addEventListener('mousedown', e => { if (!fighting() || document.pointerLockElement !== renderer.domElement) return; if (e.button === 0) fight.attack(true); else if (e.button === 2) fight.guard(true); });
  addEventListener('mouseup', e => { if (e.button === 0) fight.attack(false); else if (e.button === 2) fight.guard(false); });
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.repeat || !fighting()) return; if (e.code === 'KeyJ') fight.attack(true); else if (e.code === 'KeyK') fight.guard(true); });
  addEventListener('keyup', e => { if (e.code === 'KeyJ') fight.attack(false); else if (e.code === 'KeyK') fight.guard(false); });
  const touch = createTouch({ root: $('cn-touch'), keys, onAct: () => use(), onWhistle: () => whistle(), onLook: look, onAttack: down => { if (fighting() || !down) fight.attack(down); }, onGuard: down => { if (fighting() || !down) fight.guard(down); } });

  // What E would do right now, or null. Riding: get off. On foot: a takedown, the pen latch, or back on the cow.
  function option() {
    if (phase !== 'play') return null;
    if (herd.saved > 0 && Math.hypot(actor().x - world.exit.x, actor().z - world.exit.z) < world.exit.radius + 3) return { kind: 'leave', label: `LEAVE WITH ${herd.saved} COW${herd.saved > 1 ? 'S' : ''} SAFE${herd.penned + herd.freeCount ? ` (${herd.penned + herd.freeCount} LEFT BEHIND)` : ''}` };
    if (mode === 'ride') return foot.available && Math.abs(cow.state.speed) < 5 && !cow.state.airborne ? { kind: 'dismount', label: 'GET OFF' } : null;
    const p = foot.state;
    if (p.busy || p.climbing || p.airborne) return null;
    const near = Math.abs(p.y) < .2 ? farmers.nearest(p.x, p.z, 1.7) : null;
    if (near && (near.behind || near.unaware)) return { kind: 'takedown', label: 'TAKE DOWN', farmer: near.farmer };
    { const g = world.leverNear(p.x, p.z, 2.4, p.y); if (g) return { kind: 'latch', label: g.kind === 'main' ? 'OPEN THE MAIN GATE' : 'PULL THE LEVER', gate: g }; }
    if (Math.hypot(p.x - cow.state.x, p.z - cow.state.z) < 2.9) return { kind: 'mount', label: 'RIDE' };
    if (herd.free) { const other = herd.nearest(p.x, p.z, 2.6); if (other) return { kind: 'mount', label: 'RIDE', swap: other }; }
    return near ? { kind: 'none', label: 'HE SEES YOU' } : null;
  }
  function use() {
    const o = option(); if (!o) return;
    if (o.kind === 'leave') { end(true); return; }
    if (o.kind === 'dismount') {
      const c = cow.state, side = [[-1.35, 0], [1.35, 0], [0, 1.9]].map(([r, b]) => [c.x + Math.cos(c.yaw) * r - c.forward.x * b, c.z + Math.sin(c.yaw) * r - c.forward.z * b]).find(([x, z]) => !world.blocked(x, z, .4));
      if (!side) { say('NO ROOM TO GET OFF', 1.2); return; }
      camYaw = Math.PI - c.yaw; camPitch = -.15;
      if (!foot.enter(side[0], side[1], camYaw)) return;
      mode = 'foot'; cow.setRider(false); calling = 0; keys.delete('shift'); say('ON FOOT · C CROUCH · E USE · Q CALL THE COW', 3);
      if (!touch.active) renderer.domElement.requestPointerLock?.();
    } else if (o.kind === 'mount') { if (o.swap) herd.swap(o.swap, cow); mode = 'ride'; foot.leave(); cow.setRider(true); calling = 0; document.exitPointerLock?.(); audio.moo(.14); }
    else if (o.kind === 'takedown') {
      const f = o.farmer, A = window.GardenAnim;
      // The source pair faces the same way, with the ninja behind the farmer. Both sample the same clock, so slow
      // frames cannot separate the grab from the victim's response. Keep the existing quick hit if clips are absent.
      if (A?.has('stealthAssassin') && A.has('stealthVictim') && foot.ninja?.person && f.person) {
        // Skip the source's walking approach: the player has already approached. Keep both roles' authored drag
        // and retreat after the grab, with their full paths checked against the yard before either one commits.
        const yaw = Math.PI - f.yaw, sourceEnd = Math.min(A.duration('stealthAssassin'), A.duration('stealthVictim')), sourceStart = Math.min(2, sourceEnd * .3);
        const { x, z } = pairedAnchor(A, foot.ninja.person, f.person, { x: f.p.x, z: f.p.z, yaw, start: sourceStart });
        if (!farmers.beginTakedown(f, { sourceStart, sourceEnd })) { say('NO ROOM FOR A TAKEDOWN', 1.2); return; }
        const started = foot.beginAction({ x, z, yaw, sourceStart, sourceEnd, duration: (sourceEnd - sourceStart) / 1.45,
          valid: () => !f.ragdoll && !!f.takedown,
          onProgress: p => farmers.poseTakedown(f, p), onFinish: () => farmers.finishTakedown(f), onCancel: () => farmers.cancelTakedown(f) });
        if (!started) { farmers.cancelTakedown(f); say('NO ROOM FOR A TAKEDOWN', 1.2); }
      } else {
        const p = foot.state, d = Math.hypot(f.p.x - p.x, f.p.z - p.z) || 1;
        if (A?.has?.('cnStab') && foot.play('cnStab', { fade: .08, speed: 1.7, start: 2.4, mask: 'upper' })) setTimeout(() => foot.ninja?.person.motion.stop?.('cnStab', .25), 1300);
        else foot.play('cross', { fade: .05, speed: 1.6, mask: 'upper' });
        farmers.knock(f, (f.p.x - p.x) / d * 2.4, (f.p.z - p.z) / d * 2.4, 'takedown');
      }
    }
    else if (o.kind === 'latch') { rig.closeUntil = performance.now() + 1400; world.openGate(o.gate.id); foot.play('interact', { fade: .08, mask: 'upper' }); audio.hit(o.gate.kind === 'main' ? 'metal' : 'wood', o.gate.x, o.gate.z, .8); if (o.gate.kind === 'main') say('THE MAIN GATE IS OPEN · GET THEM OUT', 3); }
  }
  // The whistle: on foot it brings the cow to you. Anyone close enough hears it too.
  function whistle() {
    const now = performance.now(); if (phase !== 'play' || now - whistleAt < 1500) return; whistleAt = now; audio.whistle();
    const a = actor(); farmers.noise(a.x, a.z, 15, .55);
    const n = herd.recall(); if (mode === 'foot') calling = 14; else audio.moo(.2);
    say(n ? `HERD · TO ME (${n})` : mode === 'foot' ? 'CALLING YOUR COW' : 'NO FREE COWS YET', 1.4);
  }

  function end(won) {
    foot.cancelAction();
    phase = won ? 'won' : 'lost'; stats.time = (performance.now() - stats.start) / 1000; document.exitPointerLock?.();
    const down = stats.knockouts + stats.herdKnockouts + takedowns, ghost = won && !alarm;
    const full = won && herd.saved === herd.count, tally = `${herd.saved} of ${herd.count} cows safe · ${herd.lost} lost · ${herd.penned + herd.freeCount} left behind`;
    $('cn-end-title').textContent = won ? (full ? (ghost ? 'GHOST · FULL RESCUE' : 'FULL RESCUE') : `PARTIAL RESCUE · ${herd.saved} OF ${herd.count}`) : 'THEY GOT YOU';
    $('cn-end-body').textContent = `${tally} · ${down} people down (${takedowns} quietly, ${stats.herdKnockouts} by the herd) · ${stats.flips} truck${stats.flips === 1 ? '' : 's'} flipped · response reached ${STAGES[Math.max(response.stage, alarm ? 2 : 0)]} · ${stats.thrown} time${stats.thrown === 1 ? '' : 's'} thrown · ${stats.time.toFixed(0)} s`;
    $('cn-end').hidden = false;
  }
  function restart() { location.reload(); }
  $('cn-again').onclick = restart;
  $('cn-enter').onclick = () => { $('cn-gate').hidden = true; phase = 'play'; stats.start = performance.now(); renderer.domElement.focus(); audio.start(); foot.enter(world.spawn.x, world.spawn.z, world.spawn.yaw); if (!touch.active) renderer.domElement.requestPointerLock?.(); say('THE STAFF GATE IS OPEN · A RED LEVER FREES EACH PEN · GET THEM OUT THE MAIN GATE', 6); };

  // Camera. Riding: behind and above, swinging wider and lower with speed. On foot: an orbit you steer with the mouse,
  // pulled in when a wall is in the way. Both are shaken by impacts.
  const camPos = new THREE.Vector3(world.spawn.x, 6, world.spawn.z - 9), camAim = new THREE.Vector3(), want = new THREE.Vector3();
  const cam = { reach: 3.5, tilt: 0, side: .42, lead: { x: 0, z: 0 } };
  const springTo = (pos, vel, target, omega, dt) => {   // a critically damped spring: no overshoot, no lag at rest
    const x = omega * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
    for (const k of ['x', 'y', 'z']) { const change = pos[k] - target[k], temp = (vel[k] + omega * change) * dt; vel[k] = (vel[k] - omega * temp) * e; pos[k] = target[k] + (change + temp) * e; }
  };
  const probe = new THREE.Vector3();
  // Pull a camera position in towards `from` until nothing solid is between them (a short sphere march).
  function clear(from, to, pad = .3) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz) || 1;
    for (let d = .4; d <= len; d += .3) { probe.set(from.x + dx / len * d, from.y + dy / len * d, from.z + dz / len * d); if (world.solidAt(probe.x, probe.y, probe.z, .22)) { const k = Math.max(.6, d - pad) / len; to.set(from.x + dx * k, from.y + dy * k, from.z + dz * k); return true; } }
    return false;
  }
  function updateCamera(dt) {
    const free = window.cowNinja?.freeCam; // debug: [x, y, z, lookX, lookY, lookZ] pins the camera for screenshots
    if (free) { camera.position.set(free[0], free[1], free[2]); camera.lookAt(free[3], free[4], free[5]); return; }
    const now = performance.now();
    let fov = 62, roll = 0;
    // How wide: the view setting, the herd's size while riding, an order just given or being aimed, and framing requests.
    { const close = view === 'close', framed = now < rig.wideUntil && !close ? .85 : 0, aiming = aim.on ? (mode === 'ride' ? .9 : .7) : 0;
      const target = Math.max(view === 'herd' ? 1 : close ? 0 : mode === 'ride' ? Math.min(1, herd.freeCount / TUNE.camera.herdFull) : now - commandAt < 4500 ? .8 : 0, framed, aiming);
      wide += (target - wide) * (1 - Math.exp(-2.2 * dt)); camEase = Math.max(0, camEase - dt); }
    // Landings dip the camera, then it springs back.
    { const fa = foot.state.airborne, ca = cow.state.airborne;
      if (mode === 'foot' && rig.airFoot && !fa) rig.dipV -= Math.min(2.2, Math.abs(foot.state.velocity.y) * .22 + .5);
      if (mode === 'ride' && rig.airCow && !ca) rig.dipV -= 1.6;
      rig.airFoot = fa; rig.airCow = ca; rig.dipV += (-rig.dip * 90 - rig.dipV * 14) * dt; rig.dip += rig.dipV * dt; }
    rig.kick.multiplyScalar(Math.exp(-7 * dt));
    if (cine && now < cine.until) {
      want.set(cine.pos[0], cine.pos[1], cine.pos[2]); camPos.lerp(want, 1 - Math.exp(-7 * dt)); camAim.lerp(want.set(cine.aim[0], cine.aim[1], cine.aim[2]), 1 - Math.exp(-9 * dt)); fov = 50; camEase = .9; rig.vel.set(0, 0, 0);
    } else if (mode === 'foot') {
      // A freerunning camera: over the shoulder on the ground; it pulls back and rises on climbs so the wall above is in
      // frame, pulls back and tips down on a fall so the landing is, leads the way you are moving, and widens with speed.
      // A takedown or a lever pull brings it in close over the shoulder.
      const p = foot.state, climbing = p.climbing, falling = p.airborne && p.velocity.y < -3, fast = Math.min(1, p.speed / 7.5), close = p.busy || now < rig.closeUntil;
      const k = 1 - Math.exp(-4.5 * dt);
      cam.reach += (((close ? 2.2 : climbing ? 5.0 : p.airborne ? 5.2 : 3.3 + fast * 1.1) + wide * 5.5) * rig.zoom - cam.reach) * k;
      cam.tilt += ((close ? -.06 : climbing ? .3 : falling ? -.38 : 0) - wide * .32 - cam.tilt) * k;
      cam.side += ((close ? .7 : climbing || p.airborne ? 0 : .42) - cam.side) * k;
      cam.lead.x += (p.velocity.x * .22 - cam.lead.x) * k; cam.lead.z += (p.velocity.z * .22 - cam.lead.z) * k;
      const pitchNow = Math.max(-1.2, Math.min(1.0, camPitch + cam.tilt)), eye = p.y + (p.crouched ? 1.05 : 1.5), cp = Math.cos(pitchNow), dx = Math.sin(camYaw) * cp, dy = Math.sin(pitchNow), dz = Math.cos(camYaw) * cp;
      const sx = -Math.cos(camYaw) * cam.side, sz = Math.sin(camYaw) * cam.side;   // to the camera's right
      let reach = cam.reach; for (let d = .5; d <= cam.reach; d += .25) if (world.solidAt(p.x + sx - dx * d, eye - dy * d + .25, p.z + sz - dz * d, .2)) { reach = Math.max(.5, d - .3); break; }
      want.set(p.x + sx - dx * reach, Math.max(.35, eye - dy * reach + .3), p.z + sz - dz * reach); { const ceiling = Math.min(world.ceilingAt(want.x, want.z), world.ceilingAt(p.x, p.z)); if (p.y < ceiling - .5 && want.y > ceiling - .35) want.y = ceiling - .35; }
      camPos.lerp(want, 1 - Math.exp(-(camEase > 0 ? 3.5 : 14) * dt)); camAim.set(p.x + sx * .6 + cam.lead.x + dx * 4, eye + dy * 4 + .1, p.z + sz * .6 + cam.lead.z + dz * 4); fov = 62 + fast * 9 + (p.airborne ? 5 : 0) - (close ? 6 : 0);
      rig.vel.set(0, 0, 0); rig.orbitYaw = 0; rig.orbitPitch = 0;
    } else {
      // Riding: a chase camera on a spring. It sits lower and closer as the cow gathers into a charge (and the lens
      // widens), rolls a little into turns, and can be swung round by hand; let go and it drifts back behind.
      const c = cow.state, fast = Math.min(1, Math.abs(c.speed) / cow.TUNE.charge), charging = c.charging ? 1 : 0;
      rig.orbitIdle += dt; if (rig.orbitIdle > 1.6) { const back = 1 - Math.exp(-1.8 * dt); rig.orbitYaw -= rig.orbitYaw * back; rig.orbitPitch -= rig.orbitPitch * back; }
      const back = (TUNE.camera.rideBack + fast * 1.6 - charging * 1.1 + wide * (TUNE.camera.herdBack - TUNE.camera.rideBack)) * rig.zoom;
      const up = (TUNE.camera.rideUp - fast * .7 - charging * .5 + wide * (TUNE.camera.herdUp - TUNE.camera.rideUp)) * rig.zoom * (1 + rig.orbitPitch);
      const yaw = Math.atan2(c.forward.x, c.forward.z) + rig.orbitYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      want.set(c.x - fx * back, c.y + Math.max(.8, up), c.z - fz * back);
      probe.set(c.x, c.y + 1.6, c.z); clear(probe, want);
      { const ceiling = Math.min(world.ceilingAt(want.x, want.z), world.ceilingAt(c.x, c.z)); if (ceiling < Infinity) want.y = Math.min(want.y, ceiling - .45); }
      springTo(camPos, rig.vel, want, camEase > 0 ? 3 : 4.5 + fast * 3, dt); if (camPos.y < .6) camPos.y = .6;
      const lead = (2.5 + fast * 4) * (1 - Math.min(1, Math.abs(rig.orbitYaw)));
      camAim.set(c.x + c.forward.x * lead, c.y + 1.35 - wide * .6, c.z + c.forward.z * lead);
      // Roll into the turn, from how fast the cow's heading is changing.
      let turn = Math.atan2(c.forward.x, c.forward.z) - rig.lastYaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); rig.lastYaw = Math.atan2(c.forward.x, c.forward.z);
      rig.roll += (Math.max(-.07, Math.min(.07, -turn / Math.max(dt, .001) * .025 * fast)) - rig.roll) * (1 - Math.exp(-5 * dt)); roll = rig.roll;
      fov = 62 + fast * 13 + charging * 8;
    }
    shake = Math.max(0, shake - dt * 2.4);
    camera.position.copy(camPos).add(rig.kick); camera.position.y += rig.dip;
    if (shake > 0) camera.position.add(want.set((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(shake * .35));
    camera.lookAt(camAim); if (roll) camera.rotateZ(roll);
    if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  }

  // One 60 Hz tick of everything that must not depend on the frame rate.
  const none = new Set();
  function tick(live) {
    if (mode === 'ride') cow.control(STEP, keys, !live);
    else { cow.control(STEP, !live ? none : bolt && performance.now() < bolt.until ? cow.steerTo(bolt.x, bolt.z, 1.5) : calling > 0 ? cow.steerTo(foot.state.x, foot.state.z) : none, !live); if (live) foot.step(keys, camYaw, camPitch); }
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
    // 1: no reflections · 2: also no occlusion, pixel ratio 1 · 3: also no temporal AA, pixel ratio .75, smaller shadows.
    post.dispose(); post = createGrimPost({ renderer, scene, camera, level: quality });
    if (quality === 2) renderer.setPixelRatio(1);
    if (quality === 3) { renderer.setPixelRatio(.75); scene.traverse(o => { if (o.isLight && o.castShadow && o.shadow.mapSize.x > 512 && !o.isDirectionalLight) { o.shadow.mapSize.set(512, 512); o.shadow.map?.dispose(); o.shadow.map = null; } }); }
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }

  const mark = new THREE.Vector3();
  // What to do next, and where: a lever while no cow is free, then the main gate, then the safe ground.
  function objective(a) {
    const main = world.gates.find(g => g.kind === 'main'), free = herd.freeCount, tally = `${herd.penned} PENNED · ${free} FREE · ${herd.saved}/${herd.count} SAFE${herd.lost ? ` · ${herd.lost} LOST` : ''}`;
    if (!free && herd.penned) { let best = null, d = 1e9; for (const g of world.gates) if (!g.open && g.kind !== 'main') { const r = Math.hypot(g.lever.x - a.x, g.lever.z - a.z); if (r < d) { d = r; best = g; } }
      if (best) return { at: [best.lever.x, 2.6 + (best.lever.y || 0), best.lever.z], text: `PULL A RED LEVER TO FREE A PEN · ${tally}` }; }
    if (main && !main.open) return { at: [main.x, 3, main.z], text: `MAIN GATE: THE GATEHOUSE LEVER, OR A HERD CHARGE (F ON THE GATE) · ${tally}` };
    return { at: [world.exit.x, 3, world.exit.z], text: `LEAD THEM TO THE SAFE GROUND BEYOND THE GATE · ${tally}` };
  }
  const hud = { chargeLabel: $('cn-charge-label'), marker: $('cn-marker'), speed: $('cn-speed'), charge: $('cn-charge-fill'), health: $('cn-health-fill'), goal: $('cn-goal'), count: $('cn-count'), prompt: $('cn-prompt'), seen: $('cn-seen-fill'), stealth: $('cn-stealth'), keys: $('cn-keys-text') };
  let last = performance.now(), acc = 0, hudAt = 0, beat = 0;
  function frame(now) {
    const raw = Math.min(.1, (now - last) / 1000); last = now;
    if (now < hitStopUntil) { post.render(); return; }   // hit-stop: the blow hangs for a few frames
    const dt = raw * (window.EdenMelee?.timeScale() ?? 1); acc += dt;
    const live = phase === 'play';
    let steps = 0;
    while (acc >= STEP && steps < 4) { tick(live); acc -= STEP; steps++; }
    if (steps === 4) acc = 0;
    const time = now / 1000, a = actor();
    cow.update(dt); world.update(time, a); farmers.update(dt, time, live); truck.update(dt, live); herd.update(dt, time, a); blood.update(dt); blasts.update(dt, time); police.update(dt, time, live); tracer.update(now);
    // Air takedown: come down on a farmer from above and he is out, silently.
    if (live && mode === 'foot' && foot.state.airborne && foot.state.velocity.y < -2.5 && foot.state.y < 2.8) {
      const below = farmers.nearest(foot.state.x, foot.state.z, 1.35);
      if (below) { farmers.knock(below.farmer, foot.state.velocity.x * .3, foot.state.velocity.z * .3, 'takedown'); say('AIR TAKEDOWN', 1.3); shake = Math.max(shake, .3); }
    }
    if (mode === 'foot') fight.update(dt); else fight.cancel();
    if (calling > 0) { calling -= dt; if (Math.hypot(cow.state.x - foot.state.x, cow.state.z - foot.state.z) < 3) calling = 0; }
    // Hooves: four beats a stride, louder and harder the faster it goes.
    { const b = Math.floor(cow.state.gait * 4); if (b !== beat) { beat = b; const v = Math.abs(cow.state.speed); if (v > .6 && !cow.state.airborne) { const d = Math.hypot(cow.state.x - a.x, cow.state.z - a.z); if (d < 30) audio.hoof(world.indoors(cow.state.x, cow.state.z) ? 'stone' : 'grass', Math.min(6, 2 + v * .3)); } } }
    { const t = truck.body.read().p; audio.truck(truck.speed, Math.hypot(t[0] - a.x, t[2] - a.z), truck.active && !truck.flipped); }
    if (live) {
      if (alarmAt && now > alarmAt) { if (farmers.alerted()) raiseAlarm(); else alarmAt = 0; }
      if (bodyAlarm && now > bodyAlarm.at) { if (!bodyAlarm.farmer.ragdoll) raiseAlarm('THE BODY WAS REPORTED · THE ALARM IS UP'); bodyAlarm = null; }
      updateResponse(now, farmers.alertLevel());
      // Shaken lasts as long as the bombardment does: it passes once nothing has gone off near you for a while.
      if (shaken) { if (mode === 'ride') shake = Math.max(shake, .14); if (!blasts.pending && now - threatAt > TUNE.blast.recover * 1000) { shaken = false; say('STEADY AGAIN', 1.6); } }
      // Done: you stand on the safe ground and every cow still alive is there too. (With cows left behind, E leaves.)
      if (herd.saved > 0 && herd.freeCount === 0 && herd.penned === 0 && Math.hypot(a.x - world.exit.x, a.z - world.exit.z) < world.exit.radius + 3 && now - lastSaveAt > 1500) end(true);
    }
    // The aiming cursor (F held): where the order would land and what it would do, checked a few times a second.
    if (aim.on && live) {
      ray.setFromCamera(pointer, camera);
      if (!ray.ray.intersectPlane(ground, hitPoint) || hitPoint.distanceTo(camera.position) > 140) hitPoint.copy(ray.ray.direction).setY(0).normalize().multiplyScalar(60).add(camera.position).setY(0);
      aim.x = hitPoint.x; aim.z = hitPoint.z;
      if (now - aim.checkedAt > 180) { aim.checkedAt = now; aim.check = herd.check(aim.x, aim.z); }
      const r = aim.check, color = !r || !r.ok ? 0xff3030 : r.type === 'charge' ? (r.outlook.ok ? 0xffb020 : 0xff6a30) : 0x5dff8a;
      aimMark.visible = true; aimMark.position.set(r?.type === 'charge' ? r.x : aim.x, 0, r?.type === 'charge' ? r.z : aim.z); aimMark.scale.setScalar(r?.type === 'charge' ? r.gate.half / .7 : 1 + Math.sin(time * 6) * .06);
      aimMark.userData.ring.material.color.set(color); aimMark.userData.beam.material.color.set(color);
    } else aimMark.visible = false;
    // The order ring.
    { const o = herd.order, show = live && o.type !== 'follow' && herd.freeCount > 0; orderMark.visible = show;
      if (show) { const charge = o.type === 'charge', pulse = 1 + Math.sin(time * 5) * .08, size = charge ? o.gate.half + .6 : 2.2; orderMark.position.set(o.x, .12, o.z); orderMark.scale.setScalar(size * pulse); orderMark.material.color.set(charge ? 0xff4a2a : 0x5dff8a); }
      else if (live && now - orderFlash < 500) { orderMark.visible = true; orderMark.position.set(hitPoint.x, .12, hitPoint.z); orderMark.scale.setScalar(1.2); orderMark.material.color.set(0xff2020); } }
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6); post.set({ hurt: hurtFlash * .9 + (health < 30 && live ? .18 : 0) });
    updateCamera(dt); tune(dt, now);
    // The objective marker: a diamond over the lever, then your cow, then the way out; pinned to the screen edge when off it.
    { const m = hud.marker, target = !live ? null : objective(a).at;
      if (!target || window.cowNinja?.freeCam) m.hidden = true; else {
        mark.set(target[0], target[1], target[2]); const far = Math.hypot(target[0] - a.x, target[2] - a.z); mark.project(camera);
        const behind = mark.z > 1; let sx = mark.x, sy = mark.y; if (behind) { sx = -sx; sy = -1; }
        const k = Math.max(Math.abs(sx) / .92, Math.abs(sy) / .86, 1); sx /= k; sy /= k;
        m.hidden = false; m.style.transform = `translate(${((sx * .5 + .5) * container.clientWidth).toFixed(1)}px, ${((-sy * .5 + .5) * container.clientHeight).toFixed(1)}px)`; m.dataset.edge = k > 1 || behind ? '1' : '0'; m.lastChild.textContent = Math.round(far) + ' m'; } }
    if (now - hudAt > 90) { hudAt = now; const c = cow.state, level = farmers.alertLevel(), o = option();
      hud.speed.textContent = Math.round((mode === 'foot' ? foot.state.speed : Math.abs(c.speed)) * 3.6) + ' km/h'; hud.charge.style.transform = `scaleX(${(mode === 'foot' ? fight.stamina() / 100 : c.charge).toFixed(2)})`; if (hud.chargeLabel && hud.chargeLabel.dataset.mode !== mode) { hud.chargeLabel.dataset.mode = mode; hud.chargeLabel.textContent = mode === 'foot' ? 'GUARD' : 'CHARGE'; } hud.charge.parentElement.classList.toggle('full', mode === 'ride' && c.charge > .97);
      hud.health.style.transform = `scaleX(${(health / 100).toFixed(2)})`;
      hud.goal.textContent = phase === 'intro' ? '' : (shaken ? 'SHAKEN · ' : '') + objective(a).text;
      hud.count.textContent = `HERD ${herd.freeCount} · ${herd.status.toUpperCase()} · ${farmers.out()} DOWN · HEAT ${response.aggression}`;
      hud.seen.style.transform = `scaleX(${level.toFixed(2)})`; hud.stealth.textContent = mode === 'foot' && foot.state.hidden ? 'IN THE HAY' : response.stage >= 3 ? STAGES[response.stage] : alarm ? 'ALARM' : level >= 1 ? 'SPOTTED' : level > .3 ? 'SUSPICIOUS' : 'HIDDEN'; hud.stealth.parentElement.dataset.state = alarm || level >= 1 ? 'hot' : level > .3 ? 'warm' : 'cold';
      // With nothing to use, the prompt forecasts a charge at the gate you are aiming at, before you order it.
      let forecast = '';
      if (!o && live && herd.freeCount) { ray.setFromCamera(pointer, camera); if (ray.ray.intersectPlane(ground, mark)) { const g = world.gateNear(mark.x, mark.z, TUNE.herd.commandGateRadius); if (g) { const f = herd.assess(g); forecast = `${touch.active ? 'TAP' : 'F'} · CHARGE · ${f.verdict}`; } } }
      if (aim.on && aim.check) { const r = aim.check; forecast = !r.ok ? `${r.reason}` : r.type === 'charge' ? `LET GO · CHARGE · ${r.outlook.verdict}` : `LET GO · GO HERE AND HOLD`; }
      hud.prompt.textContent = aim.on && forecast ? forecast : o ? (o.kind === 'none' ? o.label : `${touch.active ? 'USE' : 'E'} · ${o.label}`) : forecast; hud.prompt.classList.toggle('show', !!o || !!forecast);
      if (hud.keys.dataset.mode !== mode) hud.keys.dataset.mode = mode;
      if (message && now > messageUntil) { message = ''; $('cn-toast').classList.remove('show'); } }
    post.render();
  }
  addEventListener('resize', () => { renderer.setSize(container.clientWidth, container.clientHeight, false); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); });
  status.hidden = true; $('cn-gate').hidden = false;
  renderer.setAnimationLoop(frame);
  window.cowNinja = { fight, assets, renderer, scene, camera, cow, foot, farmers, truck, herd, blood, world, physics, audio, keys, stats, use, whistle, look, option, command, TUNE, cycleView, blasts, police, response, provoke, raiseAlarm,
    get post() { return post; }, get mode() { return mode; }, set yaw(v) { camYaw = v; }, get yaw() { return camYaw; },
    state: () => ({ phase, mode, health, alarm, quality, takedowns, level: farmers.alertLevel(), option: option()?.kind || null, cow: { ...cow.state, forward: cow.state.forward.toArray(), velocity: cow.state.velocity.toArray() }, foot: { ...foot.state, forward: foot.state.forward.toArray(), velocity: foot.state.velocity.toArray() }, out: farmers.out(), flips: stats.flips, herdFree: herd.free, saved: herd.saved, response: { stage: response.stage, name: STAGES[response.stage], aggression: response.aggression }, shaken, thrown: stats.thrown, lost: herd.lost, herd: { status: herd.status, order: herd.order.type, free: herd.freeCount, penned: herd.penned, count: herd.count }, gates: world.gates.filter(g => g.open).map(g => g.id), blood: blood.inspect(), truckFlipped: truck.flipped }),
    begin: () => $('cn-enter').click(),
    // Advance n ticks with these keys held (headless testing): the same order as a real frame.
    step(n = 1, held = []) { for (const k of held) keys.add(k); const t = performance.now() / 1000; for (let i = 0; i < n; i++) { const live = phase === 'play'; tick(live); cow.update(STEP); farmers.update(STEP, t + i * STEP, live); truck.update(STEP, live); herd.update(STEP, t + i * STEP, actor()); blood.update(STEP); blasts.update(STEP, t + i * STEP); police.update(STEP, t + i * STEP, live); world.update(0, actor()); if (live) updateResponse(performance.now(), farmers.alertLevel()); } for (const k of held) keys.delete(k); return this.state(); } };
}

boot().catch(error => { console.error(error); const s = $('cn-status'); s.hidden = false; s.textContent = 'COWNinja could not start: ' + (error?.message || error); });
