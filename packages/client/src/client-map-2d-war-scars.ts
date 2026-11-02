// 2D canvas battle scars, counterpart of the true-3D beam-damage models
// (client-wreck-models/battle-scar-models.ts, forest-war-model.ts; rules in
// shared war-scars.ts): beam weapons leave furrows cut and fused to glass,
// glassed pits in rings of melt, and charred earth -- no wreckage -- and in a
// forest the trees burn: charred where they stood, sliced through with the top
// down beside the stump, or burnt to stumps. Each level adds to the last;
// fresh scars (the first hours after the latest battle) glow molten and smoke.
import { WAR_SCAR_MAX_LEVEL, isForestTileAt, isTropicalForestLatitudeAt, isWarScarFresh, liveWarScarLevel } from "@border-empires/shared";
import type { Tile } from "./client-types.js";
import { forestLayoutAt, treeFate, type TreeFate } from "./client-forest-war/forest-war.js";
import { forestAnchorsForSize } from "./client-forest-war/forest-anchors-2d.js";

type Ctx = CanvasRenderingContext2D;

const hash = (seed: number, i: number): number => {
  const v = Math.sin(seed * 91.345 + i * 47.853) * 24634.6345;
  return v - Math.floor(v);
};

const scorch = (ctx: Ctx, x: number, y: number, r: number, alpha: number): void => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(22,18,15,${alpha})`);
  g.addColorStop(0.6, `rgba(36,29,23,${alpha * 0.5})`);
  g.addColorStop(1, "rgba(36,29,23,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
};

const glowPulse = (now: number, i: number): number => 0.7 + 0.3 * Math.sin(now / 170 + i * 2.1);

/** A beam's fused furrow from (x0, y0) to (x1, y1). */
const furrow = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, fresh: boolean, now: number, i: number): void => {
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(24,20,17,0.6)"; ctx.lineWidth = width * 2.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = "#3a3d42"; ctx.lineWidth = width * 1.1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = "rgba(130,170,190,0.8)"; ctx.lineWidth = Math.max(0.8, width * 0.45);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (!fresh) return;
  ctx.strokeStyle = `rgba(255,${150 + Math.round(70 * glowPulse(now, i))},70,0.9)`; ctx.lineWidth = Math.max(0.8, width * 0.3);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
};

/** A glassed pit where a beam was held. */
const pit = (ctx: Ctx, x: number, y: number, r: number, fresh: boolean, now: number, i: number): void => {
  scorch(ctx, x, y, r * 2.4, 0.6);
  ctx.strokeStyle = "rgba(60,62,66,0.85)"; ctx.lineWidth = Math.max(0.6, r * 0.12);
  for (const k of [1.3, 1.05]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "#56788a";
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(200,225,235,0.45)";
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.25, 0, Math.PI * 2); ctx.fill();
  if (!fresh) return;
  ctx.fillStyle = `rgba(255,${150 + Math.round(80 * glowPulse(now, i))},70,0.9)`;
  ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
};

const smoke = (ctx: Ctx, seed: number, x: number, y: number, size: number, now: number): void => {
  const cycle = 4200;
  for (let i = 0; i < 4; i += 1) {
    const t = ((now + (i / 4) * cycle + hash(seed, i) * 600) % cycle) / cycle;
    ctx.fillStyle = `rgba(52,47,44,${0.5 * (1 - t) * Math.min(1, t * 8)})`;
    ctx.beginPath(); ctx.arc(x + size * 0.08 * t, y - size * 0.45 * t, size * (0.04 + t * 0.09), 0, Math.PI * 2); ctx.fill();
  }
};

/** One of a fought-over forest's burnt trees, at its anchor (tx, ty = the tree's foot). */
const burntTree = (ctx: Ctx, fate: TreeFate, tx: number, ty: number, size: number, seed: number, i: number, fresh: boolean, now: number): void => {
  scorch(ctx, tx, ty, size * 0.13, 0.6);
  const trunkW = Math.max(1, size * 0.04);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1c1916";
  if (fate === "charred") {
    const h = size * 0.3;
    ctx.lineWidth = trunkW;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - h); ctx.stroke();
    ctx.lineWidth = Math.max(0.7, trunkW * 0.35);
    for (let k = 0; k < 4; k += 1) {
      const y = ty - h * (0.35 + k * 0.17);
      const reach = size * 0.07 * (1 - k * 0.2);
      ctx.beginPath(); ctx.moveTo(tx - reach, y + reach * 0.4); ctx.lineTo(tx, y); ctx.lineTo(tx + reach, y + reach * 0.4); ctx.stroke();
    }
    if (fresh) smoke(ctx, seed + i, tx, ty - h, size, now);
  } else if (fate === "sliced") {
    ctx.fillStyle = "#1c1916";
    ctx.fillRect(tx - trunkW * 0.6, ty - size * 0.05, trunkW * 1.2, size * 0.05);
    ctx.fillStyle = fresh ? `rgba(255,${150 + Math.round(70 * glowPulse(now, i))},70,0.95)` : "#6b4a2e";
    ctx.fillRect(tx - trunkW * 0.6, ty - size * 0.055, trunkW * 1.2, Math.max(1, size * 0.012));
    const fall = hash(seed, i + 700) < 0.5 ? -1 : 1;
    ctx.lineWidth = trunkW * 0.9;
    ctx.beginPath(); ctx.moveTo(tx + fall * trunkW, ty - size * 0.01); ctx.lineTo(tx + fall * size * 0.24, ty - size * 0.03); ctx.stroke();
  } else {
    ctx.fillStyle = "#1c1916";
    ctx.beginPath(); ctx.ellipse(tx, ty - size * 0.01, size * 0.025, size * 0.018, 0, 0, Math.PI * 2); ctx.fill();
    if (fresh) { ctx.fillStyle = `rgba(255,150,70,${0.6 * glowPulse(now, i)})`; ctx.beginPath(); ctx.arc(tx, ty - size * 0.015, size * 0.01, 0, Math.PI * 2); ctx.fill(); }
  }
};

/** A fought-over forest's burnt trees, at the anchors the forest overlay leaves empty. */
export const drawForestWar2D = (ctx: Ctx, tile: Tile, px: number, py: number, size: number, level: number, now: number): void => {
  const { variant } = forestLayoutAt(tile.x, tile.y, isTropicalForestLatitudeAt(tile.y));
  const fresh = isWarScarFresh(tile, now);
  const seed = tile.x * 31 + tile.y * 17;
  forestAnchorsForSize(size).forEach(([ax, ay], i) => {
    const fate = treeFate(variant, level, i);
    if (fate !== "standing") burntTree(ctx, fate, px + size * ax, py + size * ay, size, seed, i, fresh, now);
  });
};

export const drawWarScars2D = (ctx: Ctx, tile: Tile, px: number, py: number, size: number, nowEpochMs: number): void => {
  if (size < 6) return;
  const level = liveWarScarLevel(tile, nowEpochMs);
  if (level <= 0) return;
  const fresh = isWarScarFresh(tile, nowEpochMs);
  const seed = tile.x * 31 + tile.y * 17;
  const at = (i: number, margin = 0.12): [number, number] =>
    [px + size * (margin + hash(seed, i) * (1 - margin * 2)), py + size * (margin + hash(seed, i + 500) * (1 - margin * 2))];
  ctx.save();
  if (level >= WAR_SCAR_MAX_LEVEL) for (let i = 0; i < 5; i += 1) { const [x, y] = at(900 + i, 0.2); scorch(ctx, x, y, size * 0.22, 0.5); }
  const axis = hash(seed, 1) * Math.PI;
  const furrows = [1, 2, 3, 4, 6][level - 1]!;
  const ends: [number, number][] = [];
  for (let i = 0; i < furrows; i += 1) {
    const angle = axis + (i % 3 === 2 ? Math.PI / 2 : 0) + (hash(seed, i + 20) - 0.5) * 0.7;
    const [cx, cy] = at(i + 40, 0.3);
    const half = size * (0.18 + hash(seed, i + 60) * 0.2);
    const x0 = cx - Math.cos(angle) * half, y0 = cy - Math.sin(angle) * half;
    const x1 = cx + Math.cos(angle) * half, y1 = cy + Math.sin(angle) * half;
    ends.push([x0, y0], [x1, y1]);
    furrow(ctx, x0, y0, x1, y1, size * 0.025, fresh, nowEpochMs, i);
  }
  for (let i = 0; i < level; i += 1) {
    const [x, y] = ends[(i * 3) % ends.length]!;
    pit(ctx, x, y, size * (0.035 + hash(seed, i + 80) * 0.02), fresh, nowEpochMs, i);
    if (fresh && i < 2) smoke(ctx, seed + i, x, y, size, nowEpochMs);
  }
  if (size >= 12 && isForestTileAt(tile.x, tile.y)) drawForestWar2D(ctx, tile, px, py, size, level, nowEpochMs);
  ctx.restore();
};
