#!/usr/bin/env bash
# Compresses the external Meshy-AI "Emerald Crop Rows" export into the single
# .glb the client loads (client-map-3d-barley-field.ts). Unlike
# bake-popup-marine-titan-model.py / convert-voidcrystal-colossus-model.py,
# this asset has no rig or animation to assemble -- it's one static mesh --
# so a plain gltf-transform CLI pipeline is enough, no Blender step needed.
#
# The raw Meshy export ships at ~24.6MB, almost entirely texture: a
# 2048x2048 base color, a 2048x2048 normal map, and (unused by a flat crop
# tile) a 4096x4096 metallic-roughness map -- ~134MB of GPU texture memory
# for ONE farm tile's material before this pipeline runs. Resizing to
# 512x512 and converting to WebP is what actually matters; weld/simplify on
# the geometry barely move the needle (the mesh is already a modest 16.6k
# verts / 7.3k tris) but are cheap to run anyway.
#
# Run:
#   ./bake-emerald-crop-field-model.sh <src.glb> <out.glb>
#
# Requires the source .glb on disk (not checked into the repo) and
# `npx @gltf-transform/cli` (no local install needed, npx fetches it).
set -euo pipefail

SRC="$1"
OUT="$2"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

npx --yes @gltf-transform/cli resize "$SRC" "$WORK/1-resize.glb" --width 512 --height 512
npx --yes @gltf-transform/cli webp "$WORK/1-resize.glb" "$WORK/2-webp.glb"
npx --yes @gltf-transform/cli dedup "$WORK/2-webp.glb" "$WORK/3-dedup.glb"
npx --yes @gltf-transform/cli prune "$WORK/3-dedup.glb" "$WORK/4-prune.glb"
npx --yes @gltf-transform/cli weld "$WORK/4-prune.glb" "$WORK/5-weld.glb"
npx --yes @gltf-transform/cli simplify "$WORK/5-weld.glb" "$OUT" --ratio 0.5 --error 0.001

echo "EXPORTED $OUT"
npx --yes @gltf-transform/cli inspect "$OUT"
