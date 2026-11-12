# Museum sculptures

Seven owner-supplied Meshy models are displayed on collision-aware plinths in the
museum. Ethereal Insight and Neon Shamrock stand in the first hall; the five
larger pieces occupy the second hall, with its crossing and doorways kept clear.

`catalog.json` records original filenames, hashes, triangle counts, and display
copy hashes. Source exports remain unchanged. These exports contain no texture
images; `museum-sculptures.js` supplies shared bronze, pewter, ivory, and patina
matcaps. Shapes are uniformly scaled, never stretched to fit their pedestals.

Display copies total approximately 8 MB and 445,000 triangles. Models load within
24 metres of a visitor inside the museum, with at most two requests in flight.
They unload beyond 34 metres or on leaving. Downloads time out after 20 seconds
and retry after 15 seconds. Late parse results are disposed after departure.

To rebuild with Blender 5:

```sh
blender --background --factory-startup --python tools/assets/build-museum-sculptures.py -- --source '/path/to/BELTS AND PENDENTS ' --output assets/museum-sculptures
```

Validation: all seven GLBs imported successfully; browser checks covered the
entrance and second hall, collision boundaries, clear connecting paths, departure
and re-entry, failed-download recovery, and the integrated showroom.
