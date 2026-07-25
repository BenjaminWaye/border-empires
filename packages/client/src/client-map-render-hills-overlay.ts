// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so this new overlay didn't push that file over the limit.
import { isHillsTile } from "./client-constants.js";
import { isTrue3DRendererActive } from "./client-renderer-mode.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render/client-map-render.js";

export const drawHillsOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number
): void => {
  if (isTrue3DRendererActive() || size < 12 || !isHillsTile(wx, wy)) return;
  const canopyYOffset = useTerrainReliefRenderer ? Math.floor(terrainReliefPx(wx, wy, "LAND", size) * 0.45) : 0;
  const moundCount = size >= 44 ? 3 : 2;
  const anchors: Array<[number, number, number]> =
    moundCount === 3
      ? [[0.28, 0.66, 0.85], [0.58, 0.56, 1], [0.78, 0.68, 0.7]]
      : [[0.36, 0.62, 1], [0.68, 0.58, 0.78]];
  ctx.save();
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor) continue;
    const [ax, ay, scale] = anchor;
    const moundW = size * 0.34 * scale;
    const moundH = moundW * 0.6;
    const hx = px + size * ax;
    const hy = py + size * ay - canopyYOffset;
    const gradient = ctx.createLinearGradient(hx, hy - moundH, hx, hy);
    gradient.addColorStop(0, "rgba(168, 158, 92, 0.92)");
    gradient.addColorStop(1, "rgba(120, 112, 58, 0.9)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(hx - moundW * 0.5, hy);
    ctx.quadraticCurveTo(hx - moundW * 0.5, hy - moundH, hx, hy - moundH);
    ctx.quadraticCurveTo(hx + moundW * 0.5, hy - moundH, hx + moundW * 0.5, hy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(203, 196, 138, 0.5)";
    ctx.beginPath();
    ctx.moveTo(hx - moundW * 0.32, hy - moundH * 0.12);
    ctx.quadraticCurveTo(hx - moundW * 0.1, hy - moundH * 0.92, hx + moundW * 0.14, hy - moundH * 0.78);
    ctx.quadraticCurveTo(hx - moundW * 0.08, hy - moundH * 0.55, hx - moundW * 0.32, hy - moundH * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};
