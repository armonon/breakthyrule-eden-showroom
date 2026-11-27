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
  'trashbag', 'utility_box_01', 'wooden_crate_02', 'pickup',
  // the detail pass
  'security_light', 'security_camera_02', 'overhead_crane', 'power_box_01', 'utility_box_02', 'hand_truck', 'industrial_storage_cart', 'plastic_crate_01',
  'wooden_barrels_01', 'industrial_pastic_container', 'small_lpg_tank', 'metal_tool_chest', 'old_military_crate', 'plastic_jerrycan', 'rusted_spade_01',
  'watering_can_metal_01', 'rubber_boots', 'sledgehammer_01', 'plastic_broom', 'rusted_wheel_rim_01', 'worn_metal_rack', 'wooden_ladder_02',
  'garden_hose_wall_mounted_01', 'wooden_crate_01',
  'concrete_road_barrier_02', 'industrial_wall_lamp', 'old_military_compressor', 'portable_welding_cart', 'metal_toolbox', 'wooden_bucket_02', 'wicker_basket_01',
  'tire_pump', 'ladder_sectioned_01', 'can_rusted', 'oil_tin', 'plastic_crate_02', 'metal_jerrycan_green', 'rusted_wheel_rim_02', 'wooden_broom', 'multi_cleaner_5_litre',
  'korean_fire_extinguisher_01', 'medical_box', 'drawer_cabinet', 'metal_stool_02', 'wooden_military_crate', 'plastic_bottle_gallon', 'street_lamp_02',
  'dead_tree_trunk_02', 'tree_stump_02', 'wall_clock',
  // vegetation
  'fern_02', 'dandelion_01', 'celandine_01', 'grass_bermuda_01', 'shrub_sorrel_01', 'wild_rooibos_bush', 'searsia_lucida', 'shrub_03', 'pine_roots',
  'root_cluster_01', 'rock_moss_set_02', 'stone_01', 'rock_07', 'tree_small_02', 'bark_debris_01', 'periwinkle_plant', 'pine_sapling_small'];
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
  // Progress: every file counts once; the big ones also report bytes. Optional files that have not arrived after
  // OPTIONAL_WAIT are given up on (the game starts without them) so a stalled request can never hold the page.
  let done = 0, total = 0;
  const pending = new Map(), bytes = new Map(), OPTIONAL_WAIT = 40000;
  const report = () => onProgress?.(done, total, [...pending.keys()], bytes);
  const track = (promise, name = 'file', critical = false) => {
    total++; pending.set(name, true);
    const finished = promise.then(v => v, error => { if (critical) throw error; console.warn('[cowninja] gave up on', name, error?.message || error); });
    const raced = critical ? finished : Promise.race([finished, new Promise(r => setTimeout(() => { if (pending.has(name)) console.warn('[cowninja] still waiting for', name, '- starting without it'); r(); }, OPTIONAL_WAIT))]);
    return raced.then(v => { if (pending.delete(name)) { done++; report(); } return v; });
  };
  const progress = name => e => { if (e.lengthComputable) { bytes.set(name, [e.loaded, e.total]); report(); } };
  const load = (name, url, critical = false) => track(gltf.loadAsync(url, progress(name)).catch(() => gltf.loadAsync(url, progress(name))).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.anisotropy = anisotropy; if (m.transparent) { m.transparent = false; m.alphaTest = .45; m.depthWrite = true; m.side = THREE.DoubleSide; } if (/chainlink_fence_wire/.test(m.name)) { m.alphaMap = mesh(); m.alphaTest = .5; m.color.set(0xb8bcc0); m.metalness = .8; m.roughness = .5; } } } });
    models.set(name, g.scene);
  }).catch(error => { if (critical) throw error; console.warn('[cowninja] model missing:', name, error?.message || error); }), name, critical);
  const map = (name, kind, colour) => track(textures.loadAsync(`${BASE}tex/${name}-${kind}.webp`).then(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy; if (colour) t.colorSpace = THREE.SRGBColorSpace; maps.set(name + kind, t);
  }).catch(() => {}), name + '-' + kind);
  const jobs = [load('cow', BASE + 'cow.glb'), load('site', BASE + 'site.glb', true)];
  let siteData = null, lightmap = null;
  jobs.push(track(fetch(BASE + 'site.json').then(r => { if (!r.ok) throw Error('site.json ' + r.status); return r.json(); }).then(d => { siteData = d;
    // The generated hero pieces the site places (assets/cowninja/modly/*.glb).
    for (const name of d.modly || []) jobs.push(load('modly:' + name, `${BASE}modly/${name}.glb`)); }), 'site.json', true));
  jobs.push(track(textures.loadAsync(BASE + 'site-lightmap.webp').then(t => { t.channel = 1; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; lightmap = t; }).catch(() => {}), 'lightmap'));
  for (const name of PROPS) jobs.push(load(name, `${BASE}props/${name}.glb`));
  // The ground's photo-scanned surfaces, blended at run time (ground.js).
  for (const name of ['aerial_grass_rock', 'dry_ground_01', 'brown_mud_leaves_01', 'gravel_floor_02']) { jobs.push(map('ground/' + name, 'diff', true)); jobs.push(map('ground/' + name, 'nor', false)); }
  for (const name of GAME_PROPS) jobs.push(load(name, `/assets/world-props/${name}.glb`));
  // (The older code-built yard's tiling surfaces, SURFACES, are no longer loaded: the site carries its own materials.)
  let sky = null;
  jobs.push(track(new HDRLoader().loadAsync(BASE + 'night-sky.hdr').then(t => {
    // The moon is thousands of times brighter than the rest of the sky: clamp it, or it floods the bloom and lights everything.
    const d = t.image.data, half = d instanceof Uint16Array, cap = 2.5;
    for (let i = 0; i < d.length; i++) { if ((i & 3) === 3) continue; const v = half ? THREE.DataUtils.fromHalfFloat(d[i]) : d[i]; if (v > cap) d[i] = half ? THREE.DataUtils.toHalfFloat(cap) : cap; }
    t.needsUpdate = true; t.mapping = THREE.EquirectangularReflectionMapping; sky = t; }).catch(error => console.warn('[cowninja] sky missing', error?.message || error)), 'sky'));
  await Promise.all(jobs); await Promise.all(jobs);   // twice: site.json adds the generated pieces to the list once it arrives

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
