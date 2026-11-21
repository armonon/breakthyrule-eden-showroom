# AI-generated props with Modly

[Modly](https://github.com/lightningpixel/modly) is a free, open-source desktop app that turns a picture into a 3D
model on your own machine. `modly-prop.mjs` has it generate a model, then makes the result fit the garden the way the
workshop props do, and lists it in the prop editor.

## Set up once (Mac)

1. Install the Modly app (Apple Silicon build from its Releases page). Open it, and on the Models page install a
   generator and let its weights download. Hunyuan3D 2 Mini Turbo is a good first try on a 24 GB Mac. If it won't
   run, use TripoSG. Modly doesn't say which generators run on a Mac, so try one picture in the app first.
2. Get Modly's command-line helper. It ships in the source repo, not inside the app, and needs only Python 3:
   `git clone https://github.com/lightningpixel/modly ~/modly`
3. In this repo: `npm install --prefix tools/asset-pipeline`

## Make a prop

With the Modly app open:

```bash
node tools/3d-gen/modly-prop.mjs --image ~/Desktop/lantern.png --name "stone lantern" --height 1.4
```

Or generate in the Modly app, export a GLB, and pass that instead of the picture:

```bash
node tools/3d-gen/modly-prop.mjs --glb ~/Downloads/lantern.glb --name "stone lantern" --height 1.4
```

The script writes `assets/props/stone-lantern-v001.glb` (the next free version, never overwriting) and adds it to
`assets/props/catalog.json`. To place it:

1. Run `node server/eden-server.mjs`.
2. Open `http://127.0.0.1:8777/?edit`.
3. Pick it under **Add**. Alt+click the ground to move it, use `[` `]` to rotate and `-` `=` to scale, then **Save**.
4. Commit the GLB, `catalog.json` and `scene.json`, then ship as usual.

What it does to the model:
- Scales it so it is `--height` metres tall. AI output has no real size, so the height is required.
- Centres it and stands it on the ground.
- Reduces it to `--triangles` (default 20,000).
- Turns textures into WebP at up to `--texture` px (default 1024).
- Quantizes the geometry, which the game's loader reads natively.
- Estimates a collision circle. Override it with `--radius`.

Options:
- `--model <id>`: choose the Modly generator (`python3 ~/modly/tools/modly-cli/agent.py model list`).
- `--rotate-x/-y/-z <degrees>`: for a model that comes out lying down or facing away. `--rotate-x -90` fixes Z-up.
- `--modly <folder>` or `MODLY_DIR`: Modly checkout, if it isn't `~/modly`.
- `--keep-raw`: also keep Modly's untouched output as `*.raw.glb` (git-ignored).

Tips:
- Use a clean picture of one object, centred, on a plain background, with no shadows cut off at the edges.
- Licenses: Hunyuan3D's license doesn't allow use in the EU, UK or South Korea and has terms for very large products.
  Check the license of whichever generator you install before shipping its output.
