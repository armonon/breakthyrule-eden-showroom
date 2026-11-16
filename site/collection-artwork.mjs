// Collection-only print finish. Blank/custom Lab models keep the customer's own plan.
const EYE_URL = '/site/artwork/eye-back.webp';
const EYE_ASPECT = 4800 / 5700;
let eyeImage;
function loadEye() {
  return eyeImage ||= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { eyeImage = null; reject(new Error('The collection back artwork could not load.')); };
    image.src = EYE_URL;
  });
}

// Keep pigment readable in bright studio lighting, with enough surface shading
// to retain folds. Do not alter the source image or its transparent edges.
function finishPrint(material) {
  material.userData.collectionPigment = true;
  material.transparent = true;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  if (material.map) material.map.anisotropy = 8;
  const compile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.65);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => previousKey + '|collection-pigment-1';
  material.needsUpdate = true;
}

function backGeometry(T, mesh, root, rect, materialIndices, backOnly) {
  // Flatten the authored transform before mapping. Fast GLBs store a quantization
  // transform on their nodes; operating on raw positions would misplace the print.
  const relative = new T.Matrix4().multiplyMatrices(root.matrixWorld.clone().invert(), mesh.matrixWorld);
  // Decode normalized integer attributes to float before applying matrices.
  // Otherwise a translated position can be clamped back into the quantized range.
  const source = new T.BufferGeometry(), authored = mesh.geometry;
  for (const key of ['position','normal']) {
    const attribute = authored.getAttribute(key), values = [];
    for (let i=0;i<attribute.count;i++) values.push(attribute.getX(i),attribute.getY(i),attribute.getZ(i));
    source.setAttribute(key,new T.Float32BufferAttribute(values,3));
  }
  if (authored.index) source.setIndex(authored.index.clone());
  for (const group of authored.groups) source.addGroup(group.start,group.count,group.materialIndex);
  source.applyMatrix4(relative);
  const p = source.getAttribute('position'), n = source.getAttribute('normal'), index = source.index;
  const positions = [], normals = [], uv = [];
  const count = index?.count ?? p.count;
  const groups = source.groups.length ? source.groups : [{start:0,count,materialIndex:0}];
  for (const group of groups) {
    if (!materialIndices.has(group.materialIndex)) continue;
    for (let i = group.start; i < Math.min(count, group.start + group.count); i += 3) {
      const triangle = [0,1,2].map(offset => index ? index.getX(i+offset) : i+offset);
      // Only the exterior, back-facing body. Exclude the front, sleeves and hems.
      if (triangle.reduce((sum,j) => sum+n.getZ(j),0)/3 > -.22) continue;
      if (!backOnly && triangle.reduce((sum,j) => sum+p.getZ(j),0)/3 >= rect.surfaceZ) continue;
      const xs = triangle.map(j=>p.getX(j)), ys = triangle.map(j=>p.getY(j));
      if (Math.max(...xs) < rect.left || Math.min(...xs) > rect.right || Math.max(...ys) < rect.bottom || Math.min(...ys) > rect.top) continue;
      for (const j of triangle) {
        positions.push(p.getX(j) + n.getX(j)*.0006, p.getY(j) + n.getY(j)*.0006, p.getZ(j) + n.getZ(j)*.0006);
        normals.push(n.getX(j),n.getY(j),n.getZ(j));
        uv.push((rect.right-p.getX(j))/(rect.right-rect.left),(p.getY(j)-rect.bottom)/(rect.top-rect.bottom));
      }
    }
  }
  source.dispose();
  if (!positions.length) return null;
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.computeBoundingSphere();
  return geometry;
}

export async function finishCollectionArtwork(gltf, sourceURL) {
  const path = new URL(sourceURL, location.href).pathname;
  if (!/^\/(graphic-models|core-collection)\/models\/.+\.glb$/.test(path) || /sacrificial-beanie/.test(path)) return gltf;
  const root = gltf.scene, T = window.THREE;
  if (root.userData.collectionEye) return gltf;
  root.updateMatrixWorld(true);
  const existingBack = [], coreBack = [], torso = [], prints = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    const materials = [].concat(object.material);
    for (const material of materials) {
      if (/^(Archive print|Core eye artwork)/.test(material.name)) prints.add(material);
      if (/^Archive print \/ back/.test(material.name)) existingBack.push(object);
      if (/^Core eye artwork/.test(material.name)) coreBack.push(material);
    }
    let body = object, isTorso = false;
    while (body && body !== root) {
      if (/^(back cotton|Raw-hem heavyweight tee - cloth|Cropped crewneck - black fleece|Reversible hoodie - cloth)$/.test(body.name.replaceAll('_',' '))) { isTorso = true; break; }
      body = body.parent;
    }
    if (isTorso) {
      const indices = new Set(materials.flatMap((m,i) => /^Archive fabric/.test(m.name) ? [i] : []));
      if (indices.size) torso.push({mesh:object,indices,backOnly:body.name.replaceAll('_',' ')==='back cotton'});
    }
  });
  if (!coreBack.length && !torso.length) return gltf;
  const image = await loadEye();
  const map = new T.Texture(image); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8; map.needsUpdate = true;
  // Core already has a fitted eye surface. Retain it, its UV orientation and hue controls.
  if (coreBack.length) {
    map.flipY = coreBack[0].map?.flipY ?? false;
    for (const material of coreBack) { material.map?.dispose(); material.map = map; }
  } else {
    const bounds = new T.Box3();
    for (const {mesh} of torso) bounds.expandByObject(mesh);
    bounds.applyMatrix4(root.matrixWorld.clone().invert());
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
    const hoodie = /hoodie/.test(path), tank = /tank/.test(path);
    // Fit the artwork below the neckline/hood and inside the side seams.
    const top = bounds.max.y - (hoodie ? .24 : tank ? .11 : .09);
    const available = Math.max(.12, top - bounds.min.y - .055);
    const width = Math.min(.4064, size.x * (tank ? .71 : .48), available * EYE_ASPECT);
    const rect = {left:center.x-width/2,right:center.x+width/2,top,bottom:top-width/EYE_ASPECT,surfaceZ:center.z};
    const material = new T.MeshStandardMaterial({name:'Archive print / back / eye',map,roughness:.93,metalness:0,transparent:true,depthWrite:false});
    material.userData.BTR_sourceKind = 'original-user-artwork';
    material.userData.BTR_sourceName = 'eye.png';
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\nif(vMapUv.x<0.0||vMapUv.x>1.0||vMapUv.y<0.0||vMapUv.y>1.0) discard;');
    };
    material.customProgramCacheKey = () => 'collection-eye-bounds-1';
    let added = 0;
    for (const {mesh,indices,backOnly} of torso) {
      const geometry = backGeometry(T,mesh,root,rect,indices,backOnly);
      if (!geometry) continue;
      const print = new T.Mesh(geometry,material); print.name = 'Collection_Eye_Back'; print.renderOrder = 2;
      root.add(print); added++;
    }
    if (!added) { material.dispose(); map.dispose(); throw new Error('The back artwork could not fit this garment.'); }
    for (const object of existingBack) object.visible = false;
    prints.add(material);
  }
  prints.forEach(finishPrint);
  root.userData.collectionEye = 'eye-back-v1';
  return gltf;
}
