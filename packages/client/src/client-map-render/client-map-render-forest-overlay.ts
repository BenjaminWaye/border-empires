// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so this didn't push that file over the limit.
import { isForestTile, isTropicalForestTile } from "../client-constants.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render.js";

export const drawForestOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number
): void => {
  if (isTrue3DRendererActive() || size < 12 || !isForestTile(wx, wy)) return;
  const canopyYOffset = useTerrainReliefRenderer ? Math.floor(terrainReliefPx(wx, wy, "LAND", size) * 0.45) : 0;
  const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.17 + wy * 0.11));
  const treeCount = size >= 44 ? 4 : size >= 24 ? 3 : 2;
  const anchors: Array<[number, number]> =
    treeCount === 4
      ? [[0.22, 0.6], [0.42, 0.44], [0.62, 0.58], [0.8, 0.42]]
      : treeCount === 3
        ? [[0.24, 0.62], [0.5, 0.42], [0.76, 0.58]]
        : [[0.34, 0.6], [0.68, 0.5]];
  const tropical = isTropicalForestTile(wx, wy);
  ctx.save();
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor) continue;
    const [ax, ay] = anchor;
    const tx = px + size * ax;
    const ty = py + size * ay - canopyYOffset;
    if (tropical) drawPalmTreeAnchor(ctx, tx, ty, size, i, pulse);
    else drawPineTreeAnchor(ctx, tx, ty, size, i, pulse);
  }
  ctx.restore();
};

const drawPineTreeAnchor = (ctx: CanvasRenderingContext2D, tx: number, ty: number, size: number, i: number, pulse: number): void => {
  const trunkW = Math.max(1, size * 0.045);
  const canopyW = size * (0.2 + i * 0.015);
  const canopyH = canopyW * 0.92;
  ctx.fillStyle = `rgba(28, 54, 27, ${0.4 + pulse * 0.16})`;
  ctx.fillRect(tx - trunkW / 2, ty - size * 0.02, trunkW, size * 0.12);
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
};

// Palm/jungle-tree variant for tropical-latitude forest tiles (see
// worldgen-latitude.ts): a tall thin trunk with a fan of frond wedges at
// the top instead of a solid pine triangle, so the equatorial belt reads
// visibly different from temperate forest here too.
const drawPalmTreeAnchor = (ctx: CanvasRenderingContext2D, tx: number, ty: number, size: number, i: number, pulse: number): void => {
  const trunkW = Math.max(1, size * 0.035);
  const trunkH = size * (0.22 + i * 0.01);
  const frondLen = size * (0.16 + i * 0.012);
  ctx.fillStyle = `rgba(90, 68, 40, ${0.5 + pulse * 0.12})`;
  ctx.fillRect(tx - trunkW / 2, ty - trunkH * 0.1, trunkW, trunkH);
  const crownY = ty - trunkH * 0.1;
  ctx.fillStyle = `rgba(58, 122, 58, ${0.68 + pulse * 0.14})`;
  const frondAngles = [-1.15, -0.55, 0, 0.55, 1.15];
  const frondHalfWidth = frondLen * 0.22;
  for (const angle of frondAngles) {
    // Frond tip: crown center offset by (sin, -cos)*length; the wedge base
    // is perpendicular to that direction so each frond reads as a blade.
    const dirX = Math.sin(angle);
    const dirY = -Math.cos(angle);
    const tipX = tx + dirX * frondLen;
    const tipY = crownY + dirY * frondLen;
    const perpX = -dirY * frondHalfWidth;
    const perpY = dirX * frondHalfWidth;
    ctx.beginPath();
    ctx.moveTo(tx, crownY);
    ctx.lineTo(tipX - perpX, tipY - perpY);
    ctx.lineTo(tipX + perpX, tipY + perpY);
    ctx.closePath();
    ctx.fill();
  }
};
