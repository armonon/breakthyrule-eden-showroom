#!/usr/bin/env bash
# Makes the generated hero pieces (assets/cowninja/modly/*.glb, 16k triangles and 1k textures each as they come from
# Modly) light enough to place by the dozen: triangles and texture size by how big the thing is, then WebP + meshopt.
# Originals stay on the claude/cowninja-modly branch. Usage: tools/cowninja/compress-modly.sh [files...]
set -euo pipefail
cd "$(dirname "$0")/../.."
SMALL=" bone-saw-hand brisket-saw bucket-steel butcher-knife-set caged-wall-lamp captive-bolt-stunner cleaver cold-room-thermometer cutting-board-stack emergency-stop floor-drain hand-wash-basin knife-steriliser meat-hooks-rack rail-trolley-hook scales-hanging shackle-chain stunner-cartridges apron-chainmail carton-boxed-beef meat-tub squeegee chain-hoist drain-channel "
HERO=" hide-puller knocking-box splitting-platform old-pickup boning-table locker-bank "
files=("$@"); [ ${#files[@]} -eq 0 ] && files=(assets/cowninja/modly/*.glb)
tmp=$(mktemp -d)
for f in "${files[@]}"; do
  if strings "$f" | grep -q EXT_meshopt_compression; then echo "skip (already compressed) $f"; continue; fi
  n=$(basename "$f" .glb); ratio=.25; px=512
  case "$SMALL" in *" $n "*) ratio=.08; px=256;; esac
  case "$HERO" in *" $n "*) ratio=.5; px=1024;; esac
  before=$(stat -c %s "$f")
  npx -y @gltf-transform/cli@4 weld "$f" "$tmp/w.glb" >/dev/null
  npx -y @gltf-transform/cli@4 simplify "$tmp/w.glb" "$tmp/s.glb" --ratio $ratio --error 0.003 >/dev/null
  npx -y @gltf-transform/cli@4 resize "$tmp/s.glb" "$tmp/a.glb" --width $px --height $px >/dev/null
  npx -y @gltf-transform/cli@4 webp "$tmp/a.glb" "$tmp/b.glb" --quality 76 >/dev/null
  npx -y @gltf-transform/cli@4 meshopt "$tmp/b.glb" "$tmp/c.glb" --level medium >/dev/null
  mv "$tmp/c.glb" "$f"; echo "$n $((before / 1024)) KB -> $(( $(stat -c %s "$f") / 1024 )) KB"
done
rm -rf "$tmp"
