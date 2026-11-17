// The approved Ballet wordmark is projected onto the back cloth, so lettering
// follows the actual ribbed surface instead of floating on a flat plane.
let canvasPromise;
function letteringCanvas() {
  return canvasPromise ||= (async () => {
    const face = new FontFace('BTR Accessory Ballet', 'url(/fonts/ballet-latin.woff2)', {weight: '400'});
    await face.load(); document.fonts.add(face);
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.font = '256px "BTR Accessory Ballet"';
    const text = 'BreakThyRule', metrics = ctx.measureText(text);
    const left = metrics.actualBoundingBoxLeft || 0, right = metrics.actualBoundingBoxRight || metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || 220, descent = metrics.actualBoundingBoxDescent || 90;
    const scale = Math.min(1900 / (left + right), 440 / (ascent + descent));
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(scale, scale);
    // Reinforce fine swashes at the same weight as the larger embroidered mark.
    ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.2; ctx.lineJoin = 'round';
    ctx.strokeText(text, (left - right) / 2, (ascent - descent) / 2);
    ctx.fillText(text, (left - right) / 2, (ascent - descent) / 2);
    return canvas;
  })().catch(error => { canvasPromise = null; throw error; });
}

export async function applyBackWordmark(root, item) {
  if (!root || !['headband', 'skully'].includes(item?.family) || root.userData.accessoryBackWordmark) return;
  const T = window.THREE, canvas = await letteringCanvas();
  if (root.userData.accessoryBackWordmark) return;
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const box = new T.Box3().setFromObject(root).applyMatrix4(inverse), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
  const cuff = new T.Box3(); let red = new T.Color('#d7192b');
  root.traverse(object => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material || [])) {
      if (/^Centaur embroidery \/ red thread/.test(material?.name || '') && material.color) red.copy(material.color);
      if (/^Folded rib cuff \/ color/.test(material?.name || '')) cuff.expandByObject(object);
    }
  });
  if (!cuff.isEmpty()) cuff.applyMatrix4(inverse);
  const width = size.x * .85;
  const height = Math.min(width / 4, !cuff.isEmpty() ? cuff.getSize(new T.Vector3()).y * .80 : size.y * .76);
  const cy = !cuff.isEmpty() ? cuff.getCenter(new T.Vector3()).y : center.y;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  const uniforms = {
    accessoryBrandMap: {value: texture}, accessoryBrandRoot: {value: inverse},
    accessoryBrandColor: {value: red},
    accessoryBrandRect: {value: new T.Vector4(center.x, cy, width, height)}, accessoryBrandBackZ: {value: center.z}
  };
  const materials = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    let printed = false;
    for (const material of [].concat(object.material || [])) {
      if (!/^(Headband body|Skully body|Folded rib cuff) \/ color/.test(material?.name || '')) continue;
      printed = true;
      if (materials.has(material)) continue; materials.add(material);
      const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer); Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'uniform mat4 accessoryBrandRoot; varying vec3 vAccessoryBrandPosition; varying vec3 vAccessoryBrandNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          mat4 brandMatrix = accessoryBrandRoot * modelMatrix;
          vAccessoryBrandPosition = (brandMatrix * vec4(transformed, 1.0)).xyz;
          vAccessoryBrandNormal = normalize(mat3(brandMatrix) * objectNormal);`);
        shader.fragmentShader = 'uniform sampler2D accessoryBrandMap; uniform vec3 accessoryBrandColor; uniform vec4 accessoryBrandRect; uniform float accessoryBrandBackZ; varying vec3 vAccessoryBrandPosition; varying vec3 vAccessoryBrandNormal;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          if(vAccessoryBrandNormal.z < -0.35 && vAccessoryBrandPosition.z < accessoryBrandBackZ){
            vec2 brandUV = vec2(-(vAccessoryBrandPosition.x-accessoryBrandRect.x)/accessoryBrandRect.z, (vAccessoryBrandPosition.y-accessoryBrandRect.y)/accessoryBrandRect.w) + 0.5;
            if(brandUV.x>=0.0 && brandUV.x<=1.0 && brandUV.y>=0.0 && brandUV.y<=1.0){
              float ink = texture2D(accessoryBrandMap,brandUV).a;
              diffuseColor.rgb = mix(diffuseColor.rgb,accessoryBrandColor,ink*0.98);
            }
          }`);
      };
      material.customProgramCacheKey = () => cacheKey + '|accessory-ballet-back-2';
      material.userData.accessoryWordmark = {texture}; material.needsUpdate = true;
    }
    if (printed) {
      const before = object.onBeforeRender;
      object.onBeforeRender = function(...args) { before.apply(this, args); uniforms.accessoryBrandRoot.value.copy(root.matrixWorld).invert(); };
    }
  });
  if (!materials.size) { texture.dispose(); return; }
  root.userData.accessoryBackWordmark = 'BreakThyRule / Ballet';
}
