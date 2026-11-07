import { townGrowthDustPuffAt, townGrowthDustPuffs, TOWN_GROWTH_DUST_MS, type TownTierUpgradeFxEntry } from "./client-town-tier-upgrade-fx.js";

// 2D canvas counterpart of the true-3D growth dust
// (client-map-3d-town-tier-upgrade-fx.ts), sampled from the same puff
// timeline: dust kicked up round the town as its new buildings rise
// (client-map-2d-town-growth.ts), billowing outward and fading. Drawn in the
// overlay pass after the town sprite.

const DUST_COLORS = ["201,178,143", "179,156,122", "216,199,168"];

export const drawTownTierUpgrade2D = (
  ctx: CanvasRenderingContext2D,
  entry: TownTierUpgradeFxEntry | undefined,
  px: number,
  py: number,
  size: number,
  nowEpochMs: number
): void => {
  if (!entry) return;
  const age = nowEpochMs - entry.startedAt;
  if (age < 0 || age >= TOWN_GROWTH_DUST_MS) return;
  const cx = px + size / 2;
  const cy = py + size * 0.78;
  const seed = Math.round(entry.x * 131 + entry.y * 17);
  ctx.save();
  for (let i = 0; i < townGrowthDustPuffs(entry.tier); i += 1) {
    const dust = townGrowthDustPuffAt(seed, i, age);
    if (dust.radius <= 0) continue;
    const x = cx + Math.cos(dust.angle) * dust.distance * size;
    const y = cy + Math.sin(dust.angle) * dust.distance * size * 0.45 - dust.rise * size;
    const r = dust.radius * size;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
    const color = DUST_COLORS[i % DUST_COLORS.length]!;
    puff.addColorStop(0, `rgba(${color},${dust.alpha})`);
    puff.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};
