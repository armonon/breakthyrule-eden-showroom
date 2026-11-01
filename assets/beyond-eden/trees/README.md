# Approved tree asset drop

Tree selection has already been handled with the user. Do not create another shortlist.

Place the optimized derivatives here:

```text
hero-tree-lod0.glb
hero-tree-lod1.glb
hero-tree-billboard.png       # intermediate, not required at runtime
hero-tree-billboard.ktx2      # runtime impostor
hero-tree-source.blend        # optional internal source; do not ship
hero-tree-source-manifest.json
 tree-source-ledger.json
```

The runtime reads the paths declared in:

```text
beyond-eden/assets/tree-manifest.json
```

If these files are absent, the scene remains functional with a procedural proxy. Missing tree files must not block temple integration, controls, streaming, or benchmark preparation.

## Build helper

```bash
bash tools/agent/build-approved-tree.sh /absolute/path/to/approved-tree.glb
```

For `.blend`, `.fbx`, or `.obj` sources, the Blender preparation script also supports those formats.

## License rule

Before any public release, fill `tree-source-ledger.json` using actual local records. Do not guess the author, source URL, license, or cost.
