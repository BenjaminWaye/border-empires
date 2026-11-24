// Capture-hold garrison, 2D canvas counterpart to the true-3D standing squad
// (client-map-3d-capture-hold-garrison.ts / popup-marine-garrison.ts): the
// troops that just took a tile hold it for the hold window (shared
// capture-hold.ts), drawn as a small rank of soldier figures in the owner's
// colour with a bar showing how much of the hold is left. The 2D renderer has
// no battle animation at all (a documented scope decision, see
// popup-marine-overlay-fx.ts), so during an attack on a held tile these
// figures simply stay put under the under-attack marker as its defenders.
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { isHoldingCapturedGround } from "./client-capture-hold/client-capture-hold.js";
import type { Tile } from "./client-types.js";

const FIGURES = 3;

/** Fraction of the hold window still left, or undefined when the tile isn't holding ground. */
export const captureHoldRemainingFraction = (tile: Tile, nowEpochMs: number): number | undefined =>
  isHoldingCapturedGround(tile, nowEpochMs) ? Math.min(1, (tile.captureHoldUntil! - nowEpochMs) / CAPTURE_HOLD_MS) : undefined;

export const drawCaptureHoldGarrison2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  ownerColor: string,
  px: number,
  py: number,
  size: number,
  nowEpochMs: number
): void => {
  const remaining = captureHoldRemainingFraction(tile, nowEpochMs);
  if (remaining === undefined || size < 8) return;
  const unit = size / 10;
  const baseY = py + size * 0.78;
  ctx.save();
  ctx.lineWidth = Math.max(1, unit * 0.35);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = ownerColor;
  for (let i = 0; i < FIGURES; i++) {
    const cx = px + size * (0.3 + i * 0.2);
    // Body: a rounded block; head: a circle on top.
    ctx.beginPath();
    ctx.rect(cx - unit * 0.7, baseY - unit * 2.2, unit * 1.4, unit * 2.2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, baseY - unit * 2.9, unit * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Hold-remaining bar under the rank.
  const barX = px + size * 0.2;
  const barW = size * 0.6;
  const barY = baseY + unit * 0.6;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(barX, barY, barW, Math.max(2, unit * 0.6));
  ctx.fillStyle = ownerColor;
  ctx.fillRect(barX, barY, barW * remaining, Math.max(2, unit * 0.6));
  ctx.restore();
};
