import type { Tile } from "../client-types.js";
import { drawAfc2D } from "../client-map-2d-afc-overlay.js";
import type { AfcJoinDropState } from "./client-afc-join-drop-state.js";
import {
  AFC_JOIN_DESCENT_MS,
  AFC_JOIN_TOTAL_MS,
  afcJoinBrakeIntensity,
  afcJoinFallenFraction
} from "./client-afc-join-drop-timeline.js";

/**
 * 2D-fallback companion to the true-3D join drop (client-map-3d-afc-drop-fx.ts),
 * driven by the same state machine and timeline so both renderers wait for the
 * same gate and pace the beat identically. The 2D path has no falling 3D model,
 * so the AFC glyph itself descends from above with an amber streak, a shrinking
 * target ring and a braking flare, then lands in a flash, dust ring, smoke and a
 * cyan power-on swell. While the drop is `waiting` the AFC is simply not drawn.
 */
type AfcTile = Pick<Tile, "x" | "y" | "afc">;

const FALL_HEIGHT_TILES = 5;
const FLASH_MS = 260;
const DUST_MS = 1600;
const SMOKE_MS = 2600;
const POWER_ON_START_MS = 1300;
const POWER_ON_MS = 1400;
const SMOKE_PUFFS = 6;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

const glow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, rgb: string, alpha: number): void => {
  if (alpha <= 0) return;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
};

const drawDescent2D = (ctx: CanvasRenderingContext2D, tile: AfcTile, px: number, py: number, size: number, nowMs: number, age: number): void => {
  const cx = px + size / 2;
  const cy = py + size / 2;
  const fallen = afcJoinFallenFraction(age);
  const offset = (1 - fallen) * size * FALL_HEIGHT_TILES;

  // Landing target ring closing in on the tile, and a shadow that grows as the hull nears.
  ctx.save();
  ctx.strokeStyle = `rgba(255, 190, 90, ${0.25 + 0.4 * fallen})`;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.setLineDash([size * 0.12, size * 0.1]);
  ctx.beginPath();
  ctx.arc(cx, cy, size * (1.3 - 0.9 * fallen), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = `rgba(20, 14, 6, ${0.08 + 0.26 * fallen})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.32, size * (0.1 + 0.2 * fallen), size * (0.03 + 0.07 * fallen), 0, 0, Math.PI * 2);
  ctx.fill();

  // Re-entry streak above the hull, fading out through the braking burn.
  const streakAlpha = clamp01(age / 500) * (1 - clamp01((age - 2000) / 840));
  if (streakAlpha > 0) {
    const gradient = ctx.createLinearGradient(cx, cy - offset, cx, cy - offset - size * 2.6);
    gradient.addColorStop(0, `rgba(255, 224, 176, ${0.7 * streakAlpha})`);
    gradient.addColorStop(1, "rgba(255, 140, 60, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - size * 0.22, cy - offset - size * 2.6, size * 0.44, size * 2.6);
  }

  // The hull itself, easing in from transparent so it isn't a sudden pop at the top of the screen.
  ctx.save();
  ctx.globalAlpha = clamp01(age / 600);
  drawAfc2D(ctx, tile, px, py - offset, size, nowMs);
  ctx.restore();

  const burn = afcJoinBrakeIntensity(age);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  glow(ctx, cx, cy - offset + size * 0.3, size * (0.6 + 0.4 * burn), "255, 190, 110", 0.7 * burn);
  ctx.restore();
};

const drawAfterglow2D = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, landedAge: number): void => {
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (landedAge < FLASH_MS) glow(ctx, cx, cy, size * 0.9, "255, 224, 168", 0.85 * (1 - landedAge / FLASH_MS));
  const dustT = clamp01(landedAge / DUST_MS);
  if (dustT < 1) {
    ctx.strokeStyle = `rgba(217, 154, 92, ${0.55 * (1 - dustT)})`;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.5 + 1.6 * easeOut(dustT)), 0, Math.PI * 2);
    ctx.stroke();
  }
  const powerT = clamp01((landedAge - POWER_ON_START_MS) / POWER_ON_MS);
  if (powerT > 0 && powerT < 1) glow(ctx, cx, cy, size * 0.9, "127, 232, 255", 0.5 * Math.sin(powerT * Math.PI));
  ctx.restore();

  const smokeT = clamp01(landedAge / SMOKE_MS);
  if (smokeT < 1) {
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const angle = (i / SMOKE_PUFFS) * Math.PI * 2;
      const spread = easeOut(clamp01(landedAge / (SMOKE_MS * 0.4)));
      ctx.fillStyle = `rgba(154, 140, 124, ${0.26 * (1 - smokeT * smokeT)})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * size * 0.7 * spread, cy + Math.sin(angle) * size * 0.45 * spread - size * 0.15 * spread, size * (0.14 + 0.16 * spread), 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

/** Draws an AFC tile for the 2D renderer, applying the join drop when it targets this tile. */
export const drawAfcTile2D = (
  ctx: CanvasRenderingContext2D,
  tile: AfcTile,
  px: number,
  py: number,
  size: number,
  nowMs: number,
  deliveryLandedAtMs: number | undefined,
  drop: AfcJoinDropState
): void => {
  if (drop.x !== tile.x || drop.y !== tile.y || (drop.phase !== "waiting" && drop.phase !== "playing")) {
    drawAfc2D(ctx, tile, px, py, size, nowMs, deliveryLandedAtMs);
    return;
  }
  if (drop.phase === "waiting") return;
  const age = nowMs - drop.startedAt;
  if (!drop.revealed && age < AFC_JOIN_DESCENT_MS) {
    drawDescent2D(ctx, tile, px, py, size, nowMs, age);
    return;
  }
  drawAfc2D(ctx, tile, px, py, size, nowMs, deliveryLandedAtMs);
  if (age < AFC_JOIN_TOTAL_MS) drawAfterglow2D(ctx, px, py, size, age - AFC_JOIN_DESCENT_MS);
};
