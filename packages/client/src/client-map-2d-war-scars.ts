// 2D canvas battle scars, counterpart of client-map-3d-war-scars.ts (rules in
// shared war-scars.ts): scorch marks, craters and broken stakes on ground
// where garrisons were taken in battle, more of them with every battle,
// until the 24h fade ends. Drawn under the tile's other features.
import { WAR_SCAR_MAX_LEVEL, liveWarScarLevel } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

const hash = (seed: number, i: number): number => {
  const v = Math.sin(seed * 91.345 + i * 47.853) * 24634.6345;
  return v - Math.floor(v);
};

export const drawWarScars2D = (ctx: CanvasRenderingContext2D, tile: Tile, px: number, py: number, size: number, nowEpochMs: number): void => {
  if (size < 6) return;
  const level = liveWarScarLevel(tile, nowEpochMs);
  if (level <= 0) return;
  const seed = tile.x * 31 + tile.y * 17;
  const depth = level / WAR_SCAR_MAX_LEVEL;
  ctx.save();
  // Scorch: soft dark blotches, darker and wider the more battles.
  for (let i = 0; i < level * 2; i += 1) {
    const cx = px + size * (0.15 + hash(seed, i) * 0.7);
    const cy = py + size * (0.15 + hash(seed, i + 40) * 0.7);
    const r = size * (0.07 + hash(seed, i + 80) * 0.07 + depth * 0.04);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgba(24,20,17,${0.45 + depth * 0.3})`);
    gradient.addColorStop(0.6, `rgba(38,30,24,${0.25 + depth * 0.2})`);
    gradient.addColorStop(1, "rgba(38,30,24,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Broken stakes: short dark strokes leaning every which way.
  ctx.strokeStyle = "rgba(60,44,30,0.9)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.lineCap = "round";
  for (let i = 0; i < level * 2; i += 1) {
    const cx = px + size * (0.12 + hash(seed, i + 120) * 0.76);
    const cy = py + size * (0.2 + hash(seed, i + 160) * 0.7);
    const angle = -Math.PI / 2 + (hash(seed, i + 200) - 0.5) * 1.6;
    const length = size * (0.06 + hash(seed, i + 240) * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.restore();
};
