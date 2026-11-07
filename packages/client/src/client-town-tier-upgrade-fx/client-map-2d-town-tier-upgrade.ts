import { townTierCelebrationFrame, townTierCelebrationProfile, townTierSparkAt, type TownTierUpgradeFxEntry } from "./client-town-tier-upgrade-fx.js";

// 2D canvas counterpart of the true-3D town tier-upgrade celebration
// (client-map-3d-town-tier-upgrade-fx.ts), sampled from the same profile and
// timeline: core flash, a light column above the town, staggered shockwave
// rings and rising sparks. Drawn per tile in the overlay pass, after the town
// sprite, so it sits on top of the town it celebrates.

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export const drawTownTierUpgrade2D = (
  ctx: CanvasRenderingContext2D,
  entry: TownTierUpgradeFxEntry | undefined,
  px: number,
  py: number,
  size: number,
  nowEpochMs: number
): void => {
  if (!entry) return;
  const profile = townTierCelebrationProfile(entry.tier);
  const frame = townTierCelebrationFrame(profile, nowEpochMs - entry.startedAt);
  if (!frame) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Shockwaves: flattened ellipses read as rings on the ground.
  frame.rings.forEach((ring, index) => {
    if (ring.alpha <= 0) return;
    const radius = (0.2 + ring.radius * profile.ringRadiusTiles) * size;
    ctx.strokeStyle = rgba(index % 2 === 0 ? profile.color : profile.accent, ring.alpha * 0.85);
    ctx.lineWidth = Math.max(1.5, size * 0.08 * (1 - ring.radius * 0.6));
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * 0.82, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Light column rising out of the town.
  if (frame.pillarAlpha > 0) {
    const height = frame.pillarGrow * profile.pillarHeightTiles * size;
    const halfWidth = size * 0.32;
    const column = ctx.createLinearGradient(cx, cy, cx, cy - height);
    column.addColorStop(0, rgba(profile.color, frame.pillarAlpha * 0.55));
    column.addColorStop(1, rgba(profile.color, 0));
    ctx.fillStyle = column;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, cy);
    ctx.lineTo(cx - halfWidth * 0.7, cy - height);
    ctx.lineTo(cx + halfWidth * 0.7, cy - height);
    ctx.lineTo(cx + halfWidth, cy);
    ctx.closePath();
    ctx.fill();
  }

  // Core flash.
  if (frame.flash > 0) {
    const r = size * (0.5 + (1 - frame.flash) * 0.9);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, rgba(profile.accent, frame.flash * 0.95));
    glow.addColorStop(1, rgba(profile.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sparks spiralling up; screen-space y carries both rise and ground drift.
  if (frame.sparkAlpha > 0) {
    const seed = entry.x * 131 + entry.y * 17;
    for (let i = 0; i < profile.sparks; i += 1) {
      const spark = townTierSparkAt(profile, seed, i, frame.t);
      if (spark.size <= 0) continue;
      const sx = cx + Math.cos(spark.angle) * spark.drift * size;
      const sy = cy + Math.sin(spark.angle) * spark.drift * size * 0.82 - spark.rise * size * 0.6;
      ctx.fillStyle = rgba(i % 2 === 0 ? profile.color : profile.accent, frame.sparkAlpha);
      const r = Math.max(1, size * 0.045 * spark.size);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};
