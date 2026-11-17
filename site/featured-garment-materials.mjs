// Local print treatment for the three collection previews. Product/Lab materials
// and source artwork stay untouched; the renderer owns model geometry/lifetime.
const FEATURED_IDS = new Set(['illuminti', 'house-of-horus', 'diamond-body', 'nu-cross', 'divide', 'war', 'god-loves-u']);
const textures = new Map();

/** Shared, bounded texture cache: at most the seven featured source graphics. */
export function loadFeaturedTexture(id) {
  if (!FEATURED_IDS.has(id)) return Promise.reject(new Error('Unknown featured graphic.'));
  if (textures.has(id)) return textures.get(id);
  const task = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const T = window.THREE, texture = new T.Texture(image);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      texture.userData.featuredGraphic = id;
      resolve(texture);
    };
    image.onerror = () => { textures.delete(id); reject(new Error('Featured artwork could not load.')); };
    image.src = '/images/breakthyrule/graphics/full/' + id + '.webp';
  });
  textures.set(id, task);
  return task;
}

const VERTEX = `
uniform mat4 featuredRootInverse;
varying vec3 featuredPosition;
varying vec3 featuredNormal;
`;
const FRAGMENT = `
uniform sampler2D featuredGraphic;
uniform float featuredHasGraphic;
uniform vec4 featuredFront;
uniform vec2 featuredHeight;
uniform vec3 featuredFrom;
uniform vec3 featuredTo;
uniform float featuredProgress;
varying vec3 featuredPosition;
varying vec3 featuredNormal;
vec3 featuredDye() {
  float height = clamp((featuredPosition.y-featuredHeight.x)/featuredHeight.y,0.0,1.0);
  float edge = featuredProgress * 1.4 - 0.2;
  float blend = 1.0 - smoothstep(edge-0.2,edge+0.2,height);
  return mix(featuredFrom,featuredTo,blend);
}
vec4 featuredInk(vec2 uv) {
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);
  return texture2D(featuredGraphic,uv);
}
`;

/**
 * Keep the authored Core garment and its correctly placed eye mesh. Only the
 * chest embroidery is hidden. Returns the unscaled root for the caller to fit.
 * Colors are THREE.Color values (linear), matching Three's material.color API.
 */
export async function prepareFeaturedGarment(gltf, kind = 'tee') {
  const T = window.THREE, root = gltf.scene;
  if (!T || !root) throw new Error('The garment preview is unavailable.');
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), bounds = new T.Box3();
  const meshes = [], hidden = [], originals = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const materials = [].concat(mesh.material);
    if (materials.some(material => /^Core logo\b/.test(material.name))) {
      hidden.push([mesh, mesh.visible]); mesh.visible = false; return;
    }
    if (!mesh.visible) return;
    if (!materials.some(material => /^Core (fabric|rib knit|stitching|eye artwork)\b/.test(material.name))) return;
    meshes.push(mesh);
    if (materials.some(material => /^Core (fabric|rib knit)\b/.test(material.name))) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const relative = new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
    }
  });
  if (bounds.isEmpty()) throw new Error('The garment fabric could not be found.');
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  const frontY = bounds.min.y + size.y * (kind === 'hoodie' ? .60 : .61);
  const frontWidth = size.x * (kind === 'hoodie' ? .43 : .47);
  const uniforms = {
    featuredRootInverse: { value: new T.Matrix4() },
    featuredGraphic: { value: null },
    featuredHasGraphic: { value: 0 },
    featuredFront: { value: new T.Vector4(center.x, frontY, frontWidth/2, frontWidth/2) },
    featuredHeight: { value: new T.Vector2(bounds.min.y, Math.max(.001, size.y)) },
    featuredFrom: { value: new T.Color('#17191d') },
    featuredTo: { value: new T.Color('#17191d') },
    featuredProgress: { value: 1 }
  };
  const cloned = new Map();
  function materialFor(source) {
    if (cloned.has(source)) return cloned.get(source);
    const material = source.clone(), eye = /^Core eye artwork\b/.test(source.name);
    const detail = /^Core (rib knit|stitching)\b/.test(source.name);
    cloned.set(source, material);
    material.color.set('#ffffff');
    if (!eye) material.map = null;
    else { material.transparent = true; material.depthWrite = false; material.roughness = .66; }
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = VERTEX + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 featuredLocal = featuredRootInverse * modelMatrix;
        featuredPosition = (featuredLocal * vec4(transformed,1.0)).xyz;
        featuredNormal = normalize(mat3(featuredLocal) * objectNormal);
      `);
      shader.fragmentShader = FRAGMENT + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float featuredPigment = 0.0;
        vec3 featuredFabric = featuredDye();
        ${eye ? `
          // Keep the garment's hue, with a distinctly separate tonal range for
          // the back print. The source alpha still cuts out every original edge.
          float eyeLuma = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          float fabricLuma = dot(featuredFabric,vec3(.2126,.7152,.0722));
          float lightCloth = smoothstep(.06,.45,fabricLuma);
          float eyeTone = mix(mix(.018,.48,pow(clamp(eyeLuma,0.0,1.0),.72)),
                              mix(.012,.34,pow(clamp(eyeLuma,0.0,1.0),.72)),lightCloth);
          vec3 dyeHue = featuredFabric/max(max(featuredFabric.r,max(featuredFabric.g,featuredFabric.b)),.004);
          diffuseColor.rgb = dyeHue * eyeTone;
        ` : `
          diffuseColor.rgb = featuredFabric * ${detail ? '0.86' : '1.0'};
          if(featuredHasGraphic>.5 && featuredNormal.z>.28) {
            vec4 ink = featuredInk((featuredPosition.xy-featuredFront.xy)/(2.0*featuredFront.zw)+.5);
            featuredPigment = ink.a;
            diffuseColor.rgb = mix(diffuseColor.rgb,ink.rgb,ink.a);
          }
        `}
      `).replace('#include <opaque_fragment>', `
        outgoingLight = mix(outgoingLight,diffuseColor.rgb,featuredPigment*.45);
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'featured-garment-gradient-2-' + Number(eye) + '-' + Number(detail);
    material.needsUpdate = true;
    return material;
  }
  for (const mesh of meshes) {
    originals.set(mesh, { material: mesh.material, onBeforeRender: mesh.onBeforeRender });
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(materialFor) : materialFor(mesh.material);
    mesh.onBeforeRender = function(...args) {
      uniforms.featuredRootInverse.value.copy(root.matrixWorld).invert();
      originals.get(mesh)?.onBeforeRender?.apply(this,args);
    };
  }
  return {
    model: root,
    setGraphic(texture) {
      uniforms.featuredGraphic.value = texture;
      uniforms.featuredHasGraphic.value = texture ? 1 : 0;
      if (!texture?.image) return;
      const image = texture.image, aspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
      const height = Math.min(size.y * .59, frontWidth / Math.max(.1, aspect));
      uniforms.featuredFront.value.set(center.x,frontY,height*aspect/2,height/2);
    },
    setColors(from, to, progress = 1) {
      uniforms.featuredFrom.value.copy(from);
      uniforms.featuredTo.value.copy(to);
      uniforms.featuredProgress.value = Math.max(0,Math.min(1,progress));
    },
    dispose() {
      for (const [mesh, original] of originals) { mesh.material = original.material; mesh.onBeforeRender = original.onBeforeRender; }
      for (const [mesh, visible] of hidden) mesh.visible = visible;
      for (const material of cloned.values()) material.dispose();
      originals.clear(); cloned.clear();
    }
  };
}
