# Blank garments for the Garment Lab preview

Downloaded on 2026-11-10 (with the owner's approval) from the Ghost Studio Shaka Graphics Lab,
https://ghost.thecreatingco.com/shaka/review-assets/{tee,hoodie,crewneck,pants}.glb.gz — Break Thy Rule's own Ghost Studio
blanks (Blender exports, Draco-compressed, ~450k triangles each).

Converted for the web with the repo's gltf-transform:

    gltf-transform optimize <in>.glb <out>.glb --compress meshopt --simplify true --simplify-ratio 0.18 \
      --simplify-error 0.0008 --texture-compress webp --texture-size 512 --join false --palette false --flatten false --instance false

| File | Source garment | Size |
| --- | --- | --- |
| tee.glb | Raw-hem heavyweight tee | ~0.8 MB |
| hoodie.glb | Reversible hoodie | ~1.1 MB |
| crewneck.glb | Crewneck | ~0.9 MB |
| pants.glb | Sweatpants | ~0.8 MB |

The Lab (site/lab.js) recolours the fabric materials (jersey / fleece / rib) to the chosen colour and keeps the knit
normal and roughness maps; topstitch thread takes a darker shade of the same colour. Shorts and the long sleeve have no
blank yet and show the drawing.
