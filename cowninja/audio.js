// COWNinja sound. Recorded impacts and voices come from the main game's combat bank (combat-audio.js, CC0 layers);
// footfalls and hooves from its synthesised footsteps (footsteps.js). The rest is made here with oscillators and
// noise: night wind, the pickup's engine, the alarm, a moo. Nothing plays until start() is called from a click.
import * as THREE from 'three/webgpu';

export function createAudio({ camera }) {
  let ctx = null, master = null, bank = null, steps = null, engine = null, engineGain = null, sirenUntil = 0, noise = null;
  const at = new THREE.Vector3();
  function start() {
    if (ctx) { ctx.resume?.(); return; }
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return; ctx = new A(); master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
      bank = window.createCombatAudio?.({ camera, T: THREE }); bank?.load(ctx, master);
      steps = window.createFootsteps?.();
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Wind: low filtered noise that slowly breathes.
      const wind = ctx.createBufferSource(), low = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      wind.buffer = noise; wind.loop = true; low.type = 'lowpass'; low.frequency.value = 320; wg.gain.value = .05; lfo.frequency.value = .11; lg.gain.value = .025;
      lfo.connect(lg).connect(wg.gain); wind.connect(low).connect(wg).connect(master); wind.start(); lfo.start();
      // Engine: two detuned saws through a low-pass; pitch and level are set every frame from the truck.
      engine = ctx.createOscillator(); const second = ctx.createOscillator(), ef = ctx.createBiquadFilter(); engineGain = ctx.createGain();
      engine.type = second.type = 'sawtooth'; engine.frequency.value = 42; second.frequency.value = 63; ef.type = 'lowpass'; ef.frequency.value = 420; engineGain.gain.value = 0;
      engine.connect(ef); second.connect(ef); ef.connect(engineGain).connect(master); engine.start(); second.start(); engine.second = second;
    } catch (error) { console.warn('[cowninja] audio off:', error?.message || error); ctx = null; }
  }
  const pos = (x, y, z) => at.set(x, y, z);
  // A recorded one-shot from the combat bank: 'body', 'head', 'kill', 'metal', 'wood', 'stone', 'dirt', 'voice-a-pain'...
  function hit(group, x, z, gain = 1, pitch = 1) { try { bank?.play(group, { pos: pos(x, 1, z), gain, pitch }); } catch { /* bank not ready */ } }
  function hoof(surface, speed) { try { steps?.step(surface, speed); } catch { /* muted */ } }
  function land(surface, strength) { try { steps?.land(surface, strength); } catch { /* muted */ } }
  function tone(type, from, to, seconds, gain, filter = 0) {
    if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .05); g.gain.exponentialRampToValueAtTime(.0008, t + seconds);
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 1.4; o.connect(f).connect(g); } else o.connect(g);
    g.connect(master); o.start(t); o.stop(t + seconds + .05);
  }
  const moo = (gain = .22) => { tone('sawtooth', 128, 92, 1.1, gain, 520); tone('sawtooth', 131, 95, 1.1, gain * .7, 900); };
  const whistle = () => { tone('sine', 1500, 2300, .22, .12); setTimeout(() => tone('sine', 2300, 1700, .3, .1), 190); };
  // The alarm: a two-tone klaxon for a few seconds.
  function siren(seconds = 5) { if (!ctx || ctx.currentTime < sirenUntil) return; sirenUntil = ctx.currentTime + seconds; for (let i = 0; i < seconds * 2; i++) setTimeout(() => tone('square', i % 2 ? 620 : 470, i % 2 ? 620 : 470, .46, .045), i * 500); }
  // Every frame: the truck's speed (m/s) and distance (m) from the listener; 0 gain when it is not running.
  function truck(speed, distance, running) {
    if (!ctx || !engine) return; const t = ctx.currentTime, level = running ? Math.min(.16, 2.2 / Math.max(6, distance)) : 0, hz = 38 + Math.abs(speed) * 5.5;
    engineGain.gain.setTargetAtTime(level, t, .15); engine.frequency.setTargetAtTime(hz, t, .1); engine.second.frequency.setTargetAtTime(hz * 1.5, t, .1);
  }
  return { start, hit, hoof, land, moo, whistle, siren, truck, get running() { return !!ctx; } };
}
