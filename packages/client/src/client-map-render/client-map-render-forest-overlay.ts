// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so adding a second tree silhouette (leaf/deciduous, alongside the
// original conifer) didn't push that file over. This is the 2D-canvas
// fallback renderer's forest overlay -- see client-map-3d-forest.ts for the
// true-3D renderer's equivalent species split (pine/spruce/leaf); both must
// stay in sync per AGENTS.md's renderer-parity rule.
import { isForestTile, isLightGrassScatterTile } from "../client-constants.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render.js";

// Same hash/salt/mod as client-map-3d-forest.ts's tileHash(worldX, worldZ,
// 11, 3) species roll (0 = pine, 1 = spruce, 2 = leaf) -- deliberately NOT
// overlayVariantIndexAt (a different, general-purpose hash used for dock/
// other overlay variants elsewhere) so a given world tile picks the same
// species in both renderers, per AGENTS.md's renderer-parity rule.
const isLeafSpeciesAt = (wx: number, wy: number): boolean =>
  (((wx * 73856093) ^ (wy * 19349663) ^ (11 * 83492791)) >>> 0) % 3 === 2;

export const drawForestOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number
): void => {
  if (isTrue3DRendererActive() || size < 12) return;
  const isForest = isForestTile(wx, wy);
  // Purely cosmetic sparse leaf sapling on light grass -- see
  // isLightGrassScatterTile's own doc comment (client-constants.ts) and
  // client-map-3d-forest.ts's addSparseLeafInstance (the true-3D equivalent).
  const isScatter = !isForest && isLightGrassScatterTile(wx, wy);
  if (!isForest && !isScatter) return;
  const canopyYOffset = useTerrainReliefRenderer ? Math.floor(terrainReliefPx(wx, wy, "LAND", size) * 0.45) : 0;
  const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.17 + wy * 0.11));
  const isLeaf = isScatter || isLeafSpeciesAt(wx, wy);
  const scatterScale = 0.62;
  const treeCount = isScatter ? 1 : size >= 44 ? 4 : size >= 24 ? 3 : 2;
  const anchors: Array<[number, number]> = isScatter
    ? [[0.5, 0.55]]
    : treeCount === 4
      ? [[0.22, 0.6], [0.42, 0.44], [0.62, 0.58], [0.8, 0.42]]
      : treeCount === 3
        ? [[0.24, 0.62], [0.5, 0.42], [0.76, 0.58]]
        : [[0.34, 0.6], [0.68, 0.5]];
  ctx.save();
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor) continue;
    const [ax, ay] = anchor;
    const sizeMult = isScatter ? scatterScale : 1;
    const trunkW = Math.max(1, size * 0.045 * sizeMult);
    const canopyW = size * (0.2 + i * 0.015) * sizeMult;
    const canopyH = canopyW * 0.92;
    const tx = px + size * ax;
    const ty = py + size * ay - canopyYOffset;
    ctx.fillStyle = `rgba(28, 54, 27, ${0.4 + pulse * 0.16})`;
    ctx.fillRect(tx - trunkW / 2, ty - size * 0.02, trunkW, size * 0.12 * sizeMult);
    if (isLeaf) {
      // Leaf/deciduous: a broad rounded canopy (two overlapping circular
      // lobes) in a warmer, lighter green -- reads distinctly from the
      // conifer triangle below even at small tile sizes.
      ctx.fillStyle = `rgba(74, 115, 46, ${0.74 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(tx - canopyW * 0.18, ty - canopyH * 0.28, canopyW * 0.34, 0, Math.PI * 2);
      ctx.arc(tx + canopyW * 0.18, ty - canopyH * 0.28, canopyW * 0.34, 0, Math.PI * 2);
      ctx.arc(tx, ty - canopyH * 0.5, canopyW * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(122, 156, 78, ${0.34 + pulse * 0.08})`;
      ctx.beginPath();
      ctx.arc(tx - canopyW * 0.1, ty - canopyH * 0.56, canopyW * 0.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = `rgba(14, 41, 18, ${0.72 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.64);
    ctx.lineTo(tx - canopyW * 0.46, ty + canopyH * 0.14);
    ctx.lineTo(tx + canopyW * 0.46, ty + canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(52, 96, 45, ${0.32 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty - canopyH * 0.52);
    ctx.lineTo(tx - canopyW * 0.24, ty - canopyH * 0.05);
    ctx.lineTo(tx + canopyW * 0.12, ty - canopyH * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};
