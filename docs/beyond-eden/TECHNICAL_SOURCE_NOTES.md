# Technical source notes

These links are for the local agent to verify APIs before changing the pinned implementation.

## Three.js

- WebGPURenderer documentation: `https://threejs.org/docs/pages/WebGPURenderer.html`
  - WebGPU is attempted by default.
  - WebGL2 is the automatic backend fallback.
  - `forceWebGL: true` forces the WebGL2 backend.
  - `antialias` and `samples` are valid constructor options.
- KTX2Loader documentation: `https://threejs.org/docs/pages/KTX2Loader.html`
  - Basis transcoder files are expected from `examples/jsm/libs/basis/`.
  - `detectSupport(renderer)` must be called before loading KTX2 textures.

## glTF Transform

- CLI documentation: `https://gltf-transform.dev/cli`
- CLI source/options: `https://github.com/donmccurdy/glTF-Transform/blob/main/packages/cli/src/cli.ts`
- Meshopt documentation: `https://gltf-transform.dev/modules/functions/functions/meshopt`
- KHR_texture_basisu documentation: `https://gltf-transform.dev/modules/extensions/classes/KHRTextureBasisu`

For the pinned 4.5.x CLI, `optimize` supports:

```text
--compress meshopt
--meshopt-level medium|high
--texture-compress ktx2
--texture-size <pixels>
--instance <bool>
--flatten <bool>
--join <bool>
--join-named <bool>
--prune <bool>
--sparse <bool>
```

The KTX2 path uses UASTC for normal/occlusion/metallic-roughness slots and ETC1S for remaining slots. KTX2 is primarily a GPU-memory and upload-performance optimization; it may not always reduce on-disk size.

## Blender 5

- glTF manual: `https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html`
- glTF export API: `https://docs.blender.org/api/5.0/bpy.ops.export_scene.html`
- Cycles baking manual: `https://docs.blender.org/manual/en/5.0/render/cycles/baking.html`

Blender 5 uses `export_vertex_color` rather than relying on the older `export_colors` keyword. The generator detects supported operator properties and uses the modern active-color-attribute path when available, with an older-exporter fallback.
