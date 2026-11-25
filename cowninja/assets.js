// COWNinja assets: real models and surfaces instead of grey boxes.
//   models    /assets/cowninja/cow.glb (rigged), /assets/cowninja/props/*.glb (Poly Haven and the pickup), and the main
//             game's own prop library in /assets/world-props (troughs, gurneys, carts, barricades)
//   surfaces  /assets/cowninja/tex/<name>-{diff,nor,arm}.webp as PBR materials with real-world tiling
//   sky       /assets/cowninja/night-sky.hdr as image-based light, so metal and wet floors have something to reflect
// Sources and licences: /assets/cowninja/CREDITS.txt (all CC0).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/cowninja/';
export const PROPS = ['barrel_02', 'modular_airduct_rectangular_01', 'covered_car', 'security_camera_01', 'fire_hydrant', 'water_manhole_cover', 'wooden_ladder',
  'metal_office_desk', 'metal_stool_01', 'tool_cart', 'metal_jerrycan', 'wooden_bucket_01', 'cardboard_box_01', 'dead_tree_trunk', 'boulder_01',
  'shrub_02', 'shrub_04', 'grass_medium_01', 'grass_medium_02', 'fir_sapling', 'tree_stump_01', 'nettle_plant', 'weed_plant_02', 'barrel_01', 'barrel_03', 'bull_head', 'caged_hanging_light', 'cement_bag', 'concrete_road_barrier', 'large_iron_gate', 'metal_trash_can',
  'modular_chainlink_fence', 'modular_industrial_pipes_01', 'mounted_fluorescent_lights', 'old_tyre', 'propane_tank', 'rollershutter_door', 'street_lamp_01',
  'trashbag', 'utility_box_01', 'wooden_crate_02', 'pickup'];
export const GAME_PROPS = ['chipped-granite-trough-v001', 'plain-limestone-trough-v001', 'plain-iron-gurney-v001', 'worn-iron-gurney-v002', 'plain-iron-operating-table-v001',
  'old-iron-operating-table-v002', 'weathered-wood-cart-v001', 'sturdy-wood-cart-v001', 'weathered-wood-barricade-v001', 'plain-wood-barricade-v001', 'old-iron-drainpipe-v001',
  'worn-iron-cell-door-v001', 'sturdy-wood-table-v001'];
export const SURFACES = ['muddy_tracks', 'concrete_floor_worn_001', 'dirty_tiles', 'factory_wall', 'rusty_corrugated_iron', 'rusty_metal_02', 'asphalt_02', 'long_white_tiles'];

export async function loadAssets({ renderer, onProgress } = {}) {
  const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
  const textures = new THREE.TextureLoader(), models = new Map(), maps = new Map();
  const anisotropy = Math.min(8, renderer?.getMaxAnisotropy?.() || 4);
  // Chain-link: the source wire texture has no cut-out, so the diamonds are drawn here and used as the alpha.
  let wire = null;
  const mesh = () => {
    if (wire) return wire;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath();
    for (const o of [-64, 0, 64]) { g.moveTo(o, 0); g.lineTo(o + 64, 64); g.moveTo(o + 64, 0); g.lineTo(o, 64); } g.stroke();
    wire = new THREE.CanvasTexture(c); wire.wrapS = wire.wrapT = THREE.RepeatWrapping; wire.repeat.set(26, 26); wire.anisotropy = anisotropy; return wire;
  };
  let done = 0, total = 0;
  const track = promise => { total++; return promise.then(v => { done++; onProgress?.(done, total); return v; }); };
  const load = (name, url) => track(gltf.loadAsync(url).catch(() => gltf.loadAsync(url)).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.anisotropy = anisotropy; if (m.transparent) { m.transparent = false; m.alphaTest = .45; m.depthWrite = true; m.side = THREE.DoubleSide; } if (/chainlink_fence_wire/.test(m.name)) { m.alphaMap = mesh(); m.alphaTest = .5; m.color.set(0xb8bcc0); m.metalness = .8; m.roughness = .5; } } } });
    models.set(name, g.scene);
  }).catch(error => { console.warn('[cowninja] model missing:', name, error?.message || error); }));
  const map = (name, kind, colour) => track(textures.loadAsync(`${BASE}tex/${name}-${kind}.webp`).then(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy; if (colour) t.colorSpace = THREE.SRGBColorSpace; maps.set(name + kind, t);
  }).catch(() => {}));
  const jobs = [load('cow', BASE + 'cow.glb'), load('site', BASE + 'site.glb')];
  let siteData = null, lightmap = null;
  jobs.push(track(fetch(BASE + 'site.json').then(r => r.json()).then(d => { siteData = d; })));
  jobs.push(track(textures.loadAsync(BASE + 'site-lightmap.webp').then(t => { t.channel = 1; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; lightmap = t; }).catch(() => {})));
  for (const name of PROPS) jobs.push(load(name, `${BASE}props/${name}.glb`));
  for (const name of GAME_PROPS) jobs.push(load(name, `/assets/world-props/${name}.glb`));
  for (const name of SURFACES) jobs.push(map(name, 'diff', true), map(name, 'nor'), map(name, 'arm'));
  let sky = null;
  jobs.push(track(new HDRLoader().loadAsync(BASE + 'night-sky.hdr').then(t => {
    // The moon is thousands of times brighter than the rest of the sky: clamp it, or it floods the bloom and lights everything.
    const d = t.image.data, half = d instanceof Uint16Array, cap = 2.5;
    for (let i = 0; i < d.length; i++) { if ((i & 3) === 3) continue; const v = half ? THREE.DataUtils.fromHalfFloat(d[i]) : d[i]; if (v > cap) d[i] = half ? THREE.DataUtils.toHalfFloat(cap) : cap; }
    t.needsUpdate = true; t.mapping = THREE.EquirectangularReflectionMapping; sky = t; }).catch(error => console.warn('[cowninja] sky missing', error?.message || error))));
  await Promise.all(jobs);

  // A PBR surface that repeats every `size` metres. Box and plane UVs run 0..1, so the repeat is set per use.
  const surfaceCache = new Map();
  function surface(name, { repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = 1, normal = 1, envMapIntensity = 1 } = {}) {
    const key = `${name}|${repeat}|${color}|${roughness}|${metalness}`; if (surfaceCache.has(key)) return surfaceCache.get(key);
    const pick = kind => { const t = maps.get(name + kind); if (!t) return null; const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
    const arm = pick('arm');
    const m = new THREE.MeshStandardMaterial({ color, map: pick('diff'), normalMap: pick('nor'), aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness, metalness, envMapIntensity });
    m.normalScale.setScalar(normal); surfaceCache.set(key, m); return m;
  }
  const has = name => models.has(name);
  // A copy of a model (or of one named part of it), sharing geometry and materials.
  function clone(name, part = null) {
    const source = models.get(name); if (!source) return null;
    if (!part) return source.clone(true);
    const node = source.getObjectByName(part); if (!node) return null;
    const copy = node.clone(true); copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); return copy;
  }
  const skinned = name => { const source = models.get(name); return source ? SkeletonUtils.clone(source) : null; };
  const size = (object) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  // Barrel_02 is listed under its Poly Haven name in site.json.
  if (models.has('barrel_02')) models.set('Barrel_02', models.get('barrel_02'));
  return { models, maps, sky, surface, clone, skinned, has, size, site: models.get('site') || null, siteData, lightmap };
}
