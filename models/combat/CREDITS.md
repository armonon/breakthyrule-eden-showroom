# Combat models: credits and licences

| file | model | author | licence |
|---|---|---|---|
| `arms_military.glb` | First-person arms of the `Military_Male_03` avatar from the [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox). Sleeve insignia painted out. | Microsoft | MIT (notice below) |
| `pistol.glb` | [Service Pistol](https://polyhaven.com/a/service_pistol) | Mateusz Sadek, Poly Haven | CC0 |
| `shotgun.glb` | Mossberg 500, from the 3D Model Haven gun pack ([archive](https://archive.org/details/gun_models.7z)) | Rajil Jose Macatangay | CC0 |
| `hatchet/` | [Hatchet](https://polyhaven.com/a/hatchet), 1k glTF | Poly Haven | CC0 |

The arms, pistol and shotgun GLBs are the first-person conversions published in
[vvanghelue/mini-cry](https://github.com/vvanghelue/mini-cry) (`public/models/fp`): re-oriented into
weapon space (−Z forward, origin at the firing hand), with textures resized. The C4 charge is
generated in code (`combat.js`).

## Microsoft Rocketbox: MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Explosion and smoke flipbooks (`vfx/`)

`explosion01_5x5.webp`, `explosion02_5x5.webp`, `cloud01_8x8.webp`, `wispysmoke01_8x8.webp`: Houdini
simulations from Unity Labs' [free VFX image sequences and flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks),
released under CC0. Converted from TGA to WebP (cloud and wisp sheets resized to 512 px).
