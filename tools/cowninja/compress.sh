#!/usr/bin/env bash
# Shrinks COWNinja's GLBs for the web after build-site.py / pack-props.py: textures to 768 px WebP, geometry
# meshopt-compressed (the game decodes it with three's MeshoptDecoder). Blender's Python module cannot read meshopt,
# so hero-render.py decodes copies first. Usage: tools/cowninja/compress.sh [files...]  (default: site + props)
set -euo pipefail
cd "$(dirname "$0")/../.."
files=("$@"); [ ${#files[@]} -eq 0 ] && files=(assets/cowninja/site.glb assets/cowninja/cow.glb assets/cowninja/props/*.glb)
tmp=$(mktemp -d)
for f in "${files[@]}"; do
  if strings "$f" | grep -q EXT_meshopt_compression; then echo "skip (already compressed) $f"; continue; fi
  before=$(stat -c %s "$f")
  npx -y @gltf-transform/cli@4 resize "$f" "$tmp/a.glb" --width "${WIDTH:-768}" --height "${WIDTH:-768}" >/dev/null
  npx -y @gltf-transform/cli@4 webp "$tmp/a.glb" "$tmp/b.glb" --quality 74 >/dev/null
  npx -y @gltf-transform/cli@4 meshopt "$tmp/b.glb" "$tmp/c.glb" --level medium >/dev/null
  mv "$tmp/c.glb" "$f"; echo "$f $((before / 1024)) KB -> $(( $(stat -c %s "$f") / 1024 )) KB"
done
rm -rf "$tmp"
