#!/usr/bin/env python3
"""Full-resolution hm08 body skinned to the showroom's 52-bone rig, for the realistic avatars.

The PS2-era character (assets/character-human-base.js) is the CC0 MakeHuman hm08 body re-rigged with MPFB2's
game-engine skeleton and then decimated to ~3k vertices. The realistic MakeHuman layers (character-human-proxies.js)
are fitted against the full 16,054-vertex hm08 mesh, so they need that mesh, skinned to the same 52 bones.

This script transfers the decimated body's skin weights onto the full mesh: every full-resolution vertex blends
the weights of its nearest decimated vertices (inverse distance), keeping only candidates that face the same way
and belong to the same coarse body region in the original 17-bone hm08 rig, so fingers, lips and the inner thighs
do not pick up weights from a neighbouring surface.

Usage:
  git show cc4fd48:assets/character-human-base.js > /tmp/hm08-full.js   # original full-resolution hm08 base
  python3 tools/build-human-full.py /tmp/hm08-full.js assets/character-human-base.js assets/character-human-full.js
"""
import json
import re
import sys

import numpy as np


def load(path):
    text = open(path, encoding="utf-8").read()
    return json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", text, re.S).group(1))


def vertex_normals(positions, triangles):
    normals = np.zeros_like(positions)
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    face = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(normals, triangles[:, k], face)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.maximum(length, 1e-9)


def region_of(bones):
    """Map every bone to its nearest ancestor (or itself) among the 17 hm08 bones."""
    coarse = {"root", "spine03", "spine01", "neck01", "head", "upperarm01.L", "lowerarm01.L", "wrist.L", "upperleg01.L",
              "lowerleg01.L", "foot.L", "upperarm01.R", "lowerarm01.R", "wrist.R", "upperleg01.R", "lowerleg01.R", "foot.R"}
    out = []
    for bone in bones:
        b = bone
        while b["name"] not in coarse and b["parent"] >= 0:
            b = bones[b["parent"]]
        out.append(b["name"] if b["name"] in coarse else "root")
    return out


def dominant(indices, weights, n):
    idx = np.asarray(indices).reshape(n, 4)
    w = np.asarray(weights).reshape(n, 4)
    return idx[np.arange(n), w.argmax(1)]


def main(full_path, rig_path, out_path):
    full, rig = load(full_path), load(rig_path)
    fp = np.asarray(full["positions"], float).reshape(-1, 3)
    rp = np.asarray(rig["positions"], float).reshape(-1, 3)
    nf, nr = len(fp), len(rp)
    fn = vertex_normals(fp, np.asarray(full["body"]).reshape(-1, 3))
    rn = vertex_normals(rp, np.asarray(rig["body"] + rig["clothes"]).reshape(-1, 3))

    full_region = [full["bones"][i]["name"] for i in dominant(full["indices"], full["weights"], nf)]
    rig_regions = region_of(rig["bones"])
    rig_region = [rig_regions[i] for i in dominant(rig["indices"], rig["weights"], nr)]
    rig_region_id = np.array([hash(r) for r in rig_region])
    full_region_id = np.array([hash(r) for r in full_region])
    ri = np.asarray(rig["indices"]).reshape(nr, 4)
    rw = np.asarray(rig["weights"], float).reshape(nr, 4)

    out_idx = np.zeros((nf, 4), int)
    out_w = np.zeros((nf, 4))
    fallback = 0
    for start in range(0, nf, 512):
        chunk = slice(start, min(nf, start + 512))
        d = np.linalg.norm(fp[chunk, None, :] - rp[None, :, :], axis=2)
        order = np.argsort(d, axis=1)[:, :16]
        for row, v in enumerate(range(chunk.start, chunk.stop)):
            cands = order[row]
            ok = (rig_region_id[cands] == full_region_id[v])
            facing = rn[cands] @ fn[v]
            if np.linalg.norm(fn[v]) > .5:
                ok &= facing > -.2
            chosen = cands[ok][:4]
            if len(chosen) == 0:
                chosen = cands[:3]
                fallback += 1
            inv = 1 / np.maximum(d[row, chosen], 1e-4) ** 2
            mix = {}
            for c, s in zip(chosen, inv / inv.sum()):
                for k in range(4):
                    if rw[c, k] > 0:
                        mix[ri[c, k]] = mix.get(ri[c, k], 0) + s * rw[c, k]
            top = sorted(mix.items(), key=lambda x: -x[1])[:4]
            total = sum(w for _, w in top) or 1
            for k, (bone, w) in enumerate(top):
                out_idx[v, k], out_w[v, k] = bone, w / total

    data = {
        "source": "MakeHuman hm08 CC0 at full resolution, skinned to the MPFB2 game-engine rig (CC0) by weight transfer "
                  "from assets/character-human-base.js (tools/build-human-full.py)",
        "bones": rig["bones"],
        "eyes": full["eyes"],
        "positions": [round(float(x), 5) for x in fp.ravel()],
        "indices": [int(x) for x in out_idx.ravel()],
        "weights": [round(float(x), 4) for x in out_w.ravel()],
    }
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("'use strict';\n// Generated by tools/build-human-full.py. CC0 MakeHuman hm08 + MPFB2 rig; see character-human-license.txt.\n")
        f.write("window.GardenHumanFull=" + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"{nf} vertices skinned to {len(rig['bones'])} bones; {fallback} used the unguarded fallback -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
