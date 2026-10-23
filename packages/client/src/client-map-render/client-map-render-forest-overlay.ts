// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so adding a second tree silhouette (leaf/deciduous, alongside the
// original conifer) didn't push that file over. This is the 2D-canvas
// fallback renderer's forest overlay -- see client-map-3d-forest.ts for the
// true-3D renderer's equivalent species split (pine/spruce/leaf); both must
// stay in sync per AGENTS.md's renderer-parity rule.
import { isForestTile, isLightGrassScatterTile, isTropicalForestLatitude } from "../client-constants.js";
import { drawBlackwoodSwirl, type ProspectClueDraw } from "../client-prospect-signature-overlay.js";
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
  size: number,
  prospectClue?: ProspectClueDraw,
  // Overridable so the caller can keep footprint forest drawn until an AFC
  // join drop lands (isForestTileWithAfcLandingHold).
  forestAt: (x: number, y: number) => boolean = isForestTile
): void => {
  if (isTrue3DRendererActive() || size < 12) return;
  const isForest = forestAt(wx, wy);
  // Purely cosmetic sparse leaf sapling on light grass -- see
  // isLightGrassScatterTile's own doc comment (client-constants.ts) and
  // client-map-3d-forest.ts's addSparseLeafInstance (the true-3D equivalent).
  const isScatter = !isForest && isLightGrassScatterTile(wx, wy);
  if (!isForest && !isScatter) return;
  const canopyYOffset = useTerrainReliefRenderer ? Math.floor(terrainReliefPx(wx, wy, "LAND", size) * 0.45) : 0;
  const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.17 + wy * 0.11));
  // Tropical-latitude forest tiles always render as palm, overriding the
  // ordinary pine/spruce/leaf species roll (worldgen-latitude.ts).
  const tropical = isForest && isTropicalForestLatitude(wy);
  const isLeaf = !tropical && (isScatter || isLeafSpeciesAt(wx, wy));
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
    const tx = px + size * ax;
    const ty = py + size * ay - canopyYOffset;
    if (tropical) {
      drawPalmTreeAnchor(ctx, tx, ty, size, i, pulse);
      continue;
    }
    const sizeMult = isScatter ? scatterScale : 1;
    drawConiferOrLeafAnchor(ctx, tx, ty, size, i, pulse, isLeaf, sizeMult);
  }
  ctx.restore();
  // Blackwood canopy (an Umbrite clue): a purple swirl rises out of the forest
  // every few seconds -- 2D twin of client-map-3d-blackwood-swirl.ts. The other
  // clues' ground props draw after the hills overlay (client-map-facade.ts).
  if (isForest && prospectClue?.signature === "BLACKWOOD_CANOPY" && prospectClue.propsAllowed) drawBlackwoodSwirl(ctx, wx, wy, px, py - canopyYOffset, size);
};

// Soft contact shadow under each tree, cast down-right like the 3D map's sun,
// so trees sit on the ground instead of floating as flat icons.
const drawTreeShadow = (ctx: CanvasRenderingContext2D, tx: number, ty: number, radius: number, pulse: number): void => {
  ctx.fillStyle = `rgba(12, 26, 8, ${0.2 + pulse * 0.06})`;
  ctx.beginPath();
  ctx.ellipse(tx + radius * 0.25, ty + radius * 0.12, radius * 0.62, radius * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawConiferOrLeafAnchor = (
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number,
  i: number,
  pulse: number,
  isLeaf: boolean,
  sizeMult: number
): void => {
  const trunkW = Math.max(1, size * 0.045 * sizeMult);
  const canopyW = size * (0.2 + i * 0.015) * sizeMult;
  const canopyH = canopyW * 0.92;
  drawTreeShadow(ctx, tx, ty + size * 0.08 * sizeMult, canopyW, pulse);
  ctx.fillStyle = `rgba(62, 40, 28, ${0.62 + pulse * 0.14})`;
  ctx.fillRect(tx - trunkW / 2, ty - size * 0.02, trunkW, size * 0.12 * sizeMult);
  if (isLeaf) {
    // Leaf/deciduous: a broad rounded crown of overlapping lobes in a warmer,
    // lighter green -- reads distinctly from the conifer tiers below even at
    // small tile sizes. Shaded body, then a sunlit cap up and to the left
    // (the 3D map's leaf crowns light the same way).
    ctx.fillStyle = `rgba(50, 82, 32, ${0.8 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.arc(tx - canopyW * 0.18, ty - canopyH * 0.26, canopyW * 0.34, 0, Math.PI * 2);
    ctx.arc(tx + canopyW * 0.2, ty - canopyH * 0.24, canopyW * 0.32, 0, Math.PI * 2);
    ctx.arc(tx, ty - canopyH * 0.52, canopyW * 0.37, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(104, 144, 62, ${0.7 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.arc(tx - canopyW * 0.08, ty - canopyH * 0.58, canopyW * 0.26, 0, Math.PI * 2);
    ctx.arc(tx - canopyW * 0.24, ty - canopyH * 0.32, canopyW * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(160, 192, 98, ${0.38 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.arc(tx - canopyW * 0.14, ty - canopyH * 0.66, canopyW * 0.12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Conifer: three stacked needle tiers, each split into a shaded and a
  // sunlit half -- the 2D read of the 3D map's tiered pines and spruces.
  const tiers = [0, 1, 2].map((k) => ({
    halfW: canopyW * (0.5 - k * 0.12),
    baseY: ty + canopyH * (0.14 - k * 0.26),
    apexY: ty + canopyH * (0.14 - k * 0.26) - canopyH * (0.52 - k * 0.06)
  }));
  ctx.fillStyle = `rgba(16, 44, 22, ${0.8 + pulse * 0.12})`;
  ctx.beginPath();
  for (const tier of tiers) {
    ctx.moveTo(tx, tier.apexY);
    ctx.lineTo(tx - tier.halfW, tier.baseY);
    ctx.lineTo(tx + tier.halfW, tier.baseY);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = `rgba(56, 102, 58, ${0.72 + pulse * 0.12})`;
  ctx.beginPath();
  for (const tier of tiers) {
    ctx.moveTo(tx, tier.apexY);
    ctx.lineTo(tx - tier.halfW, tier.baseY);
    ctx.lineTo(tx - tier.halfW * 0.1, tier.baseY - (tier.baseY - tier.apexY) * 0.12);
    ctx.closePath();
  }
  ctx.fill();
};

// Palm/jungle-tree variant for tropical-latitude forest tiles (see
// worldgen-latitude.ts): a tall, slightly curved trunk with a fan of frond
// blades at the top instead of a solid pine triangle, so the equatorial belt
// reads visibly different from temperate forest here too.
const drawPalmTreeAnchor = (ctx: CanvasRenderingContext2D, tx: number, ty: number, size: number, i: number, pulse: number): void => {
  const trunkW = Math.max(1, size * 0.035);
  const trunkH = size * (0.22 + i * 0.01);
  const frondLen = size * (0.16 + i * 0.012);
  const crownY = ty - trunkH * 0.1;
  const footY = crownY + trunkH;
  drawTreeShadow(ctx, tx + frondLen * 0.3, footY, frondLen * 1.1, pulse);
  ctx.strokeStyle = `rgba(96, 72, 44, ${0.62 + pulse * 0.12})`;
  ctx.lineWidth = trunkW;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx - trunkW * 0.8, footY);
  ctx.quadraticCurveTo(tx - trunkW * 1.4, crownY + trunkH * 0.45, tx, crownY);
  ctx.stroke();
  const frondAngles = [-1.15, -0.55, 0, 0.55, 1.15];
  const frondHalfWidth = frondLen * 0.22;
  const blade = (angle: number, length: number, litHalf: boolean): void => {
    // Frond tip: crown center offset by (sin, -cos)*length; the wedge base
    // is perpendicular to that direction so each frond reads as a blade.
    const dirX = Math.sin(angle);
    const dirY = -Math.cos(angle);
    const tipX = tx + dirX * length;
    const tipY = crownY + dirY * length;
    const perpX = -dirY * frondHalfWidth;
    const perpY = dirX * frondHalfWidth;
    ctx.moveTo(tx, crownY);
    ctx.lineTo(tipX - perpX, tipY - perpY);
    ctx.lineTo(litHalf ? tipX : tipX + perpX, litHalf ? tipY : tipY + perpY);
    ctx.closePath();
  };
  ctx.fillStyle = `rgba(40, 96, 42, ${0.74 + pulse * 0.14})`;
  ctx.beginPath();
  for (const angle of frondAngles) blade(angle, frondLen, false);
  ctx.fill();
  ctx.fillStyle = `rgba(112, 170, 76, ${0.6 + pulse * 0.14})`;
  ctx.beginPath();
  for (const angle of frondAngles) blade(angle, frondLen * 0.92, true);
  ctx.fill();
};
