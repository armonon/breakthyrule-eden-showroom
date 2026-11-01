# Coordinate conventions and sector alignment

The browser runtime uses the normal three.js convention: **X right, Y up, and the initial view faces −Z**.

Blender uses **X right, Y depth, Z up**. With the glTF exporter’s `export_yup` conversion, browser coordinates must be authored in Blender as:

```text
browser (x, y, z) -> Blender (x, -z, y)
```

Examples:

| Runtime target | Browser position | Blender authoring position |
|---|---:|---:|
| Temple body | `(0, 10, -48.5)` | `(0, 48.5, 10)` |
| Plaza paving | `(0, -0.14, -2)` | `(0, 2, -0.14)` |
| South approach | `(0, -0.11, 65)` | `(0, -65, -0.11)` |
| West approach | `(-56, -0.11, 7)` | `(-56, -7, -0.11)` |

The procedural proxy and generated GLBs must occupy the same world coordinates. The ritual door is represented in the Blender source for reference but excluded from static GLB exports because the runtime creates the interactive door and page seals separately.

After every Blender build, verify alignment by toggling or temporarily comparing proxy and GLB sectors before benchmarking. A sector that appears behind the spawn or on the wrong side of the plaza indicates a sign-conversion regression.
