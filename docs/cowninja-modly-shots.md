# COWNinja: pieces to generate with Modly

The site is built in Blender by `tools/cowninja/build-site.py`. These hero pieces need organic detail that scripted
modelling does poorly. Generate them with Modly on the Mac (see `tools/3d-gen/README.md` for setup), export each as a
GLB, and drop the files into `assets/cowninja/modly/` with the names below. Then ask Claude to "bring in the Modly
pieces": they get scaled, lit and placed in the site.

Use a clean photo or render of one object on a plain background, lit evenly, about three-quarters view.

| File name | Picture of | Real size | Where it goes |
|---|---|---|---|
| `hide-pile.glb` | a heap of folded cattle hides | 1.4 m wide | hide room by the rear door |
| `offal-bin.glb` | a wheeled plastic bin, lid open | 1.1 m tall | offal room, back yard skips |
| `stun-gun.glb` | a captive-bolt stunner | 0.45 m long | on the knocking box rail |
| `boning-table.glb` | a stainless table with knives and hooks | 2 m long | kill floor |
| `pressure-washer.glb` | a wheeled pressure washer with its hose | 1 m tall | kill floor, by the hose reels |
| `hay-bale-square.glb` | a square straw bale, loose strands | 1 m long | lairage, pen |
| `water-trough-steel.glb` | a galvanised stock trough | 2 m long | lairage pens |
| `feed-sacks.glb` | stacked feed sacks on a pallet | 1.2 m wide | lairage, boiler yard |
| `old-tractor.glb` | a worn farm tractor | 3.5 m long | back yard |
| `farmer-boots.glb` | muddy rubber boots, a pair | 0.4 m tall | locker room |

Commands, with the Modly app open, one per picture:

```bash
node tools/3d-gen/modly-prop.mjs --image ~/Desktop/hide-pile.png --name "hide pile" --height 0.7
```

That script files its result under `assets/props/` for the garden; for COWNinja, copy the GLB it writes to
`assets/cowninja/modly/<file name>` instead. Or export a GLB from the Modly app directly into that folder.

## Picture prompts

Modly turns a picture into a model, so each piece starts as a picture. Paste these into any image generator. Every
prompt ends with the same line so the pictures come out the way Modly reads best.

Common ending (add to each): `single object, centred, three-quarter view from slightly above, plain light grey
background, soft even studio lighting, no shadows on the ground, no other objects, no text, photorealistic, sharp
focus, whole object in frame`

| File name | Prompt |
|---|---|
| `hide-pile.glb` | a heap of folded raw cattle hides, brown and black and white fur outside, pale pink-cream underside, stacked about 70 cm high, slightly wet |
| `offal-bin.glb` | a battered grey plastic wheelie bin, lid hinged open, two black wheels, scuffed and stained dark red around the rim |
| `stun-gun.glb` | an industrial captive-bolt cattle stunner, heavy steel cylinder body with a pistol grip and trigger, worn black paint, chrome bolt end |
| `boning-table.glb` | a stainless steel butchery table, 2 metres long, with a raised back rail holding hooks and three knives, a white plastic cutting board on top, scratched and slightly stained |
| `pressure-washer.glb` | a yellow and black wheeled industrial pressure washer with a coiled black hose and a steel lance hooked on the side, dirty from use |
| `hay-bale-square.glb` | a single rectangular straw bale tied with two orange twines, loose strands sticking out, pale golden straw |
| `water-trough-steel.glb` | a galvanised steel livestock water trough, oval, 2 metres long, dented, dull grey with water marks |
| `feed-sacks.glb` | a wooden pallet stacked with six woven white feed sacks with faded green print, one sack slumped |
| `old-tractor.glb` | an old worn small farm tractor, faded red paint with rust, large rear tyres caked in mud, open seat, no cab |
| `farmer-boots.glb` | a pair of tall black rubber work boots standing upright, caked with mud and dried blood splashes |

In Modly: one picture per run, Hunyuan3D 2 Mini Turbo (or TripoSG if that will not run), texture on, then export as
GLB. Keep each under about 50k triangles if Modly offers a target; Claude reduces them further when bringing them in.
