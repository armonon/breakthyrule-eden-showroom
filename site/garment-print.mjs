// Prints artwork onto a loaded 3D blank — shared by the Garment Lab and the shop hero.
// Planar projection in the fabric shader, in garment space: the front gets a composition of up to three graphics,
// the back one big print (16 × 20 in on every size). It follows the folds, turns with the garment and spans
// multi-part pieces.
import { BACK_SIZES } from '/labkit/catalog.mjs';

const IN = .0254;
export const BLANKS = { tee: '/models/blanks/tee.glb', hoodie: '/models/blanks/hoodie.glb', crewneck: '/models/blanks/crewneck.glb', sweatpants: '/models/blanks/pants.glb' };
const FRONT_ZONES = { // fractions of garment width/height: centre x, centre y, print width
  tee: { front: [0, .64, .46], chest: [.2, .78, .16] },
  hoodie: { front: [0, .57, .34], chest: [.17, .64, .13] },
  crewneck: { front: [0, .66, .42], chest: [.2, .78, .15] },
  pants: { front: [.22, .66, .26], chest: [.22, .86, .14] }
};
const BACK_TOP_GAP = { tee: .075, crewneck: .08, hoodie: .30 }; // metres below the top of the garment (hoodies: below the hood)
const imageCache = new Map();
const loadImage = src => { if (!imageCache.has(src)) imageCache.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; })); return imageCache.get(src); };
export const fullArt = id => '/images/breakthyrule/graphics/full/' + id + '.webp';
export const preloadArt = ids => Promise.all(ids.map(id => loadImage(fullArt(id)).catch(() => null)));

async function sideCanvas(plan, inkLight, back, backSize) {
  const bs = BACK_SIZES[backSize] || BACK_SIZES.full;
  const c = document.createElement('canvas'); c.width = back ? Math.round(1024 * bs.w / bs.h) : 1024; c.height = 1024; const x = c.getContext('2d'), W = c.width, H = c.height;
  const ink = inkLight ? 'rgba(245,240,230,.92)' : 'rgba(20,18,16,.88)';
  const fit = (img, cx, cy, w, h) => { if (!img) return; const k = Math.min(w / img.width, h / img.height); x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); };
  if (plan.kind === 'big' || plan.kind === 'refs') {
    const imgs = await preloadArt(plan.ids);
    if (plan.kind === 'big' || imgs.length === 1) fit(imgs[0], W / 2, H / 2, W, H);
    else if (imgs.length === 2) { fit(imgs[0], W / 2, H * .33, W * .9, H * .62); fit(imgs[1], W / 2, H * .8, W * .7, H * .38); }
    else { fit(imgs[0], W / 2, H * .44, W * .78, H * .7); fit(imgs[1], W * .22, H * .82, W * .4, H * .34); fit(imgs[2], W * .78, H * .82, W * .4, H * .34); }
  } else if (plan.kind === 'minimal') {
    x.fillStyle = ink; x.translate(W / 2, H / 2);
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-40, -60); x.lineTo(40, -60); x.lineTo(150, -380); x.quadraticCurveTo(0, -320, -150, -380); x.closePath(); x.fill(); x.rotate(Math.PI / 2); }
    x.beginPath(); x.arc(0, 0, 72, 0, Math.PI * 2); x.fill(); x.setTransform(1, 0, 0, 1, 0, 0);
  } else if (plan.kind === 'expressive') {
    x.lineCap = 'round'; x.lineJoin = 'round'; x.scale(W / 1024, H / 1024);
    for (const [col, w, pts] of [['#c9473b', 130, [120, 300, 420, 60, 640, 760, 920, 380]], ['#e0b44c', 100, [90, 720, 420, 470, 600, 940, 940, 660]], ['#3554a5', 70, [200, 900, 380, 560, 700, 780, 840, 140]]]) {
      x.strokeStyle = col; x.lineWidth = w; x.globalAlpha = .9; x.beginPath(); x.moveTo(pts[0], pts[1]); x.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); x.stroke();
    }
    x.globalAlpha = .85; x.fillStyle = ink; for (const [cx, cy, r] of [[300, 230, 28], [760, 820, 22], [820, 260, 36], [210, 560, 18], [540, 520, 46]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; x.setTransform(1, 0, 0, 1, 0, 0);
  }
  const T = window.THREE, tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
const DECAL_VERT = `#include <begin_vertex>
  mat4 decalM = decalRootInv * modelMatrix;
  vDecalPos = (decalM * vec4(transformed, 1.0)).xyz; vDecalNrm = normalize(mat3(decalM) * objectNormal);`;
const DECAL_FRAG = `#include <map_fragment>
  {
    vec4 d = vec4(0.0);
    if (decalFlags.x > .5 && vDecalNrm.z > .2) d = decalAt(decalMap, (vDecalPos.xy - decalFront.xy) / (2.0 * decalFront.zw) + .5);
    if (decalFlags.y > .5 && vDecalNrm.z < -.2) d = decalAt(decalMapBack, vec2(-(vDecalPos.x - decalBack.x), vDecalPos.y - decalBack.y) / (2.0 * decalBack.zw) + .5);
    diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, d.a * .96);
  }`;
function decalMaterial(m) {
  if (m.userData.decal) return m.userData.decal;
  const T = window.THREE;
  const u = { decalMap: { value: null }, decalMapBack: { value: null }, decalRootInv: { value: new T.Matrix4() }, decalFront: { value: new T.Vector4() }, decalBack: { value: new T.Vector4() }, decalFlags: { value: new T.Vector2() } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform mat4 decalRootInv;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\n' + shader.vertexShader.replace('#include <begin_vertex>', DECAL_VERT);
    shader.fragmentShader = 'uniform sampler2D decalMap;\nuniform sampler2D decalMapBack;\nuniform vec4 decalFront;\nuniform vec4 decalBack;\nuniform vec2 decalFlags;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\nvec4 decalAt(sampler2D map, vec2 uv){ if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0); return texture2D(map, uv); }\n'
      + shader.fragmentShader.replace('#include <map_fragment>', DECAL_FRAG);
  };
  m.customProgramCacheKey = () => 'btr-lab-decal-2';
  m.needsUpdate = true;
  m.userData.decal = u;
  return u;
}
let blank = null;
const blankTex = () => { const T = window.THREE; blank ||= new T.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true; return blank; };
const isFabric = m => !/topstitch|thread/i.test(m.name);

// One printer per viewer. apply() dyes the loaded model and prints the plan onto it.
//   kind      'tee' | 'hoodie' | 'crewneck' | 'pants'
//   plan      { front: {kind:'refs', ids}|{kind:'minimal'}|{kind:'expressive'}|null, back: {kind:'big', ids}|…|null, small? }
//   color     a THREE.Color for the fabric
//   backSize  'full' | 'medium'
//   print     { x, y, scale } — the customer's nudge of the front print
// Returns { front, back } textures (null when a side has no print), or null when a newer apply() took over.
export function createPrinter(viewer) {
  let token = 0, lastKey = '', texKey = '', texF = null, texB = null, model = null;
  async function apply({ kind, plan, color, backSize = 'full', print = { x: 0, y: 0, scale: 1 } }) {
    const T = window.THREE, m = viewer.model(); if (!m || !T) return null;
    if (m !== model) { model = m; lastKey = ''; texKey = ''; }
    const my = ++token;
    // Dye
    m.traverse(n => { if (!n.isMesh) return; for (const mat of [].concat(n.material)) { if (isFabric(mat)) { mat.map = null; mat.color.copy(color); } else mat.color.copy(color).multiplyScalar(.55); mat.needsUpdate = true; } });
    // Measure the garment in its own space
    const garmentRoot = m.children[0] || m; garmentRoot.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(garmentRoot.matrixWorld).invert();
    const fabric = [], box = new T.Box3();
    m.traverse(n => { if (!n.isMesh) return; const rel = new T.Matrix4().multiplyMatrices(inv, n.matrixWorld);
      if (!n.geometry.boundingBox) n.geometry.computeBoundingBox(); box.union(n.geometry.boundingBox.clone().applyMatrix4(rel));
      for (const mat of [].concat(n.material)) if (isFabric(mat)) fabric.push([n, mat]); });
    const size = box.getSize(new T.Vector3()), min = box.min, max = box.max;
    const zones = FRONT_ZONES[kind] || FRONT_ZONES.tee, pr = print;
    const fz = plan.small ? zones.chest : plan.front?.kind === 'expressive' ? [zones.front[0], zones.front[1] - .04, Math.min(.66, zones.front[2] * 1.4)] : zones.front;
    const front = new T.Vector4(min.x + size.x * (.5 + fz[0] + pr.x), min.y + size.y * (fz[1] + pr.y), size.x * fz[2] * pr.scale / 2, size.x * fz[2] * pr.scale / 2);
    // The back: one big print, 16 × 20 in (whatever the size), centred, starting just below the collar (or the hood).
    let back;
    if (kind === 'pants') back = new T.Vector4(min.x + size.x * .28, min.y + size.y * .62, size.x * .13, size.x * .13 / .9);
    else {
      const bs = BACK_SIZES[backSize] || BACK_SIZES.full;
      let hw = bs.w / 2 * IN, hh = bs.h / 2 * IN;
      const k = Math.min(1, (size.x * .33) / hw); hw *= k; hh *= k; // stays on the body, off the sleeves
      const top = max.y - (BACK_TOP_GAP[kind] ?? .08); let cy = top - hh;
      if (cy - hh < min.y + .03) { const room = (top - min.y - .03) / 2; const s2 = room / hh; hw *= s2; hh *= s2; cy = top - hh; }
      back = new T.Vector4(min.x + size.x * .5, cy, hw, hh);
    }
    const light = (color.r * .3 + color.g * .59 + color.b * .11) < .35;
    const key = JSON.stringify([plan, light, pr, backSize, color.getHex()]);
    if (key === lastKey) { viewer.redraw(); return { front: texF, back: texB }; }
    lastKey = key;
    const tk = JSON.stringify([plan, light, backSize]);
    let f = texF, b = texB;
    if (texKey !== tk) {
      [f, b] = await Promise.all([plan.front ? sideCanvas(plan.front, light, false, backSize) : null, plan.back ? sideCanvas(plan.back, light, true, backSize) : null]);
      if (my !== token || viewer.model() !== m) { lastKey = ''; for (const t of [f, b]) if (t && t !== texF && t !== texB) t.dispose(); return null; }
      for (const t of [texF, texB]) if (t && t !== f && t !== b) t.dispose();
      texF = f; texB = b; texKey = tk;
    }
    for (const [mesh, mat] of fabric) {
      const u = decalMaterial(mat);
      u.decalMap.value = f || blankTex(); u.decalMapBack.value = b || blankTex();
      u.decalFront.value.copy(front); u.decalBack.value.copy(back);
      u.decalFlags.value.set(f ? 1 : 0, b ? 1 : 0);
      if (!mesh.userData.decalHook) { mesh.userData.decalHook = true; mesh.onBeforeRender = () => { const d = mat.userData.decal; if (d) d.decalRootInv.value.copy(garmentRoot.matrixWorld).invert(); }; }
    }
    viewer.redraw();
    return { front: f, back: b };
  }
  return { apply, textures: () => ({ front: texF, back: texB }), reset() { lastKey = ''; texKey = ''; } };
}
