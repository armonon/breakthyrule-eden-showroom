// The ground, blended at run time: four photo-scanned Poly Haven surfaces (meadow grass with stones, dry cracked
// earth, mud with fallen leaves, gravel) mixed by a mask the game builds from the site: worn earth and mud round
// everything paved, gravel spilling off the hard standing, grass taking over towards the fence and beyond it, all
// broken up by noise at two scales so nothing repeats. Each surface is also sampled twice, at two scales and turned,
// and blended, which hides its tiling. The grass field (grass.js) reads the same mask, so blades grow where the
// ground is green. The baked light stays on.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, vec2, vec3, vec4, float, mix, normalMap, mx_noise_float } from 'three/tsl';

export const LAYERS = ['aerial_grass_rock', 'dry_ground_01', 'brown_mud_leaves_01', 'gravel_floor_02'];
const TILE = [3.4, 2.8, 2.4, 2.0], ROUGH = [.95, .9, .5, .85];

// Smooth value noise (deterministic), 0..1.
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * .55 + vnoise(x * 2.03 + 17, z * 2.03 + 9) * .3 + vnoise(x * 4.1 + 3, z * 4.1 + 41) * .15;

// The mask over `bounds` [x0, x1, z0, z1]: RGBA = grass, dry earth, mud, gravel (sums to 255).
export function buildMask({ paved = [], fence = null, bounds = [-200, 220, -380, 220], res = 512 }) {
  const [x0, x1, z0, z1] = bounds, data = new Uint8Array(res * res * 4), grassW = new Float32Array(res * res);
  const sx = (x1 - x0) / res, sz = (z1 - z0) / res;
  const distPaved = (x, z) => { let d = 1e9; for (const r of paved) { const dx = Math.max(r[0] - x, 0, x - r[1]), dz = Math.max(r[2] - z, 0, z - r[3]); d = Math.min(d, Math.hypot(dx, dz)); if (d === 0) break; } return d; };
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = x0 + (i + .5) * sx, z = z0 + (j + .5) * sz, n = fbm(x * .035, z * .035), n2 = fbm(x * .12 + 40, z * .12 - 7);
    const inside = fence && x > fence[0] && x < fence[1] && z > fence[2] && z < fence[3];
    const toFence = fence ? Math.min(Math.abs(x - fence[0]), Math.abs(x - fence[1]), Math.abs(z - fence[2]), Math.abs(z - fence[3])) : 99;
    const dp = distPaved(x, z);
    let g, d, m, v;
    if (inside) {
      // A worked yard: trodden earth and mud near everything paved, grass back towards the fence and in the corners.
      const worn = Math.exp(-dp / 6);
      g = Math.max(0, (n - .38) * 2.2) * (1 - worn * .85) + Math.max(0, 1 - toFence / 6) * .9;
      m = worn * .7 * (n2 > .45 ? 1 : .35) + Math.max(0, .3 - n) * .8;
      v = Math.exp(-dp / 1.3) * .9 * (n2 < .6 ? 1 : .4);
      d = .35 + (1 - n) * .4;
    } else {
      // Beyond the fence: meadow, with dry patches and a muddy verge along the road.
      g = .7 + (n - .5) * 1.4; d = Math.max(0, .55 - n) * 1.2 + (n2 > .7 ? .3 : 0); m = Math.exp(-dp / 2.5) * .6; v = Math.exp(-dp / .8) * .7;
    }
    g = Math.max(0, g); d = Math.max(0, d); m = Math.max(0, m); v = Math.max(0, v);
    if (dp === 0) { g *= .1; }   // under paving it does not show anyway
    const s = g + d + m + v || 1, k = (j * res + i) * 4;
    data[k] = Math.round(g / s * 255); data[k + 1] = Math.round(d / s * 255); data[k + 2] = Math.round(m / s * 255); data[k + 3] = 255 - data[k] - data[k + 1] - data[k + 2];
    grassW[j * res + i] = dp === 0 ? 0 : g / s;
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  // How green the ground is at a point (0..1), for the grass field.
  const grass = (x, z) => { const i = Math.floor((x - x0) / sx), j = Math.floor((z - z0) / sz); return i < 0 || j < 0 || i >= res || j >= res ? .8 : grassW[j * res + i]; };
  return { texture: tex, bounds, grass, fbm };
}

// The blended material, on top of what the baked mesh had (its light map).
export function groundMaterial({ maps, mask, base, quality = 0, wet = false }) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: .95, metalness: 0 });
  if (base?.lightMap) { m.lightMap = base.lightMap; m.lightMapIntensity = base.lightMapIntensity; }
  m.envMapIntensity = .25;
  const [x0, x1, z0, z1] = mask.bounds, p = positionWorld.xz;
  const w = texture(mask.texture, p.sub(vec2(x0, z0)).div(vec2(x1 - x0, z1 - z0)));
  const swirl = mx_noise_float(p.mul(.045)).mul(.5).add(.5), turn = vec2(.8, .6);
  let col = vec3(0), nor = vec3(0), rough = float(0);
  LAYERS.forEach((name, i) => {
    const d = maps.get(`ground/${name}diff`), n = maps.get(`ground/${name}nor`); if (!d) return;
    const weight = [w.r, w.g, w.b, w.a][i], uvA = p.div(TILE[i]);
    let c = texture(d, uvA).rgb, nn = n ? texture(n, uvA).rgb : vec3(.5, .5, 1);
    if (quality < 2) {   // a second, larger, turned sample blended in by noise: no visible tiling
      const uvB = vec2(p.x.mul(turn.x).sub(p.y.mul(turn.y)), p.x.mul(turn.y).add(p.y.mul(turn.x))).div(TILE[i] * 2.3);
      c = mix(c, texture(d, uvB).rgb, swirl); if (n) nn = mix(nn, texture(n, uvB).rgb, swirl);
    }
    col = col.add(c.mul(weight)); nor = nor.add(nn.mul(weight)); rough = rough.add(weight.mul(ROUGH[i]));
  });
  // Large soft variation in tone, as light and moisture vary across a real field.
  const tone = mx_noise_float(p.mul(.012)).mul(.14).add(.92);
  m.colorNode = vec4(col.mul(tone).mul(.5), 1);
  m.normalNode = normalMap(nor, vec2(1.1, 1.1));
  m.roughnessNode = wet ? rough.mul(.45) : rough;   // rain: everything glistens
  return m;
}
