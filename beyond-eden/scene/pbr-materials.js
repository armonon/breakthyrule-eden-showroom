import * as THREE from 'three/webgpu';
import { color, float, normalWorld, positionWorld, texture, triplanarTexture, uniform } from 'three/tsl';

// Photographic stone for the temple slice. The sector GLBs carry no UVs (only position, normal and the Blender-
// baked AO/cool-indirect vertex colour), so CC0 Poly Haven scans are projected triplanar in world space and
// multiplied by the baked vertex colour. One shared material per surface type keeps draw state small.
//
// Sector materials are classified by their properties rather than names, because gltf-transform's palette pass
// renames merged materials: metallic -> bronze (kept), saturated -> mosaic (kept), dark -> paving, pale -> wall
// stone, in between -> recessed facade panels.
const ROOT = '/assets/beyond-eden/materials/';

export function createPbrMaterialLibrary({ assetLoader }) {
  const ktx2 = assetLoader.ktx2;
  const load = name => new Promise(resolve => {
    ktx2.load(ROOT + name, tex => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; resolve(tex); }, undefined, () => resolve(null));
  });
  const exposureBoost = uniform(1);
  const make = (diff, arm, { scale, tint, roughness = 1 }) => {
    const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: 0 });
    const albedo = triplanarTexture(texture(diff), null, null, float(scale), positionWorld, normalWorld);
    const packed = triplanarTexture(texture(arm), null, null, float(scale), positionWorld, normalWorld);
    material.colorNode = albedo.rgb.mul(color(tint)).mul(packed.r.mul(.55).add(.45)).mul(exposureBoost); // arm.r = ambient occlusion
    material.roughnessNode = packed.g.mul(roughness).clamp(.35, 1);
    material.userData.shared = true; // disposeSector must never free a library material
    return material;
  };
  const ready = Promise.all([
    'concrete_slab_wall_02_diff.ktx2', 'concrete_slab_wall_02_arm.ktx2',
    'concrete_tile_facade_diff.ktx2', 'concrete_tile_facade_arm.ktx2',
    'concrete_pavers_02_diff.ktx2', 'concrete_pavers_02_arm.ktx2',
  ].map(load)).then(([wallD, wallA, panelD, panelA, paveD, paveA]) => {
    if (![wallD, wallA, panelD, panelA, paveD, paveA].every(Boolean)) return null;
    return {
      wall: make(wallD, wallA, { scale: .33, tint: 0xe2dccd }),
      recessed: make(panelD, panelA, { scale: .42, tint: 0xa9a59b }),
      paving: make(paveD, paveA, { scale: .28, tint: 0x9a9a92, roughness: .95 }),
    };
  });

  const luminance = c => .2126 * c.r + .7152 * c.g + .0722 * c.b;
  function classify(material) {
    if (!material || material.isNodeMaterial || material.map?.isCanvasTexture && /mosaic/i.test(material.name)) return null;
    if ((material.metalness ?? 0) > .4) return null; // bronze stays as authored
    const c = material.color || new THREE.Color(1, 1, 1), max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max > 0 && (max - min) / max > .32) return null; // the mosaic band and other coloured accents stay as authored
    if (/paving|ground/i.test(material.name)) return 'paving';
    const l = luminance(c);
    return l < .09 ? 'paving' : l > .2 ? 'wall' : 'recessed';
  }

  return {
    ready,
    // Swap qualifying materials in a loaded sector (GLB or procedural proxy) once the textures exist.
    async apply(root) {
      const library = await ready;
      if (!library || !root) return 0;
      let swapped = 0;
      root.traverse(object => {
        if (!object.isMesh || Array.isArray(object.material)) return;
        const kind = classify(object.material);
        if (!kind) return;
        object.material = library[kind];
        swapped += 1;
      });
      return swapped;
    },
    dispose() { ready.then(library => { if (library) for (const m of Object.values(library)) m.dispose(); }); },
  };
}
