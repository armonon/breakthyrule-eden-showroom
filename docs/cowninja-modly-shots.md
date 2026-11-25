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
