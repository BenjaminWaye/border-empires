// 2D canvas battle scars, counterpart of the true-3D battle-scar models
// (client-wreck-models/battle-scar-models.ts; rules in shared war-scars.ts):
// shell craters with thrown-up earth rims, broken pikes and spent arrows,
// dropped shields and helmets, burnt timbers and a broken wheel, stake
// barricades, and embers and smoke on the worst ground. Each level adds to
// the last, until the 24h fade ends. Drawn under the tile's other features.
import { WAR_SCAR_MAX_LEVEL, liveWarScarLevel } from "@border-empires/shared";
import type { Tile } from "./client-types.js";
import { isForestTileAt, isTropicalForestLatitudeAt } from "@border-empires/shared";
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

const crater = (ctx: Ctx, seed: number, i: number, x: number, y: number, r: number): void => {
  scorch(ctx, x, y, r * 2, 0.55);
  // Thrown-up rim, lit on its far side; the blackened pit.
  ctx.fillStyle = "#6b4a2e";
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(170,140,100,0.55)";
  ctx.lineWidth = Math.max(0.8, r * 0.18);
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.12, r * 0.84, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = "#1c1814";
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.08, r * 0.82, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 6; k += 1) {
    const a = hash(seed, i * 13 + k) * Math.PI * 2;
    const d = r * (1.4 + hash(seed, i * 13 + k + 6) * 0.7);
    ctx.fillStyle = k % 2 ? "#5a4330" : "#4a4d53";
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, Math.max(0.7, r * 0.14), 0, Math.PI * 2); ctx.fill();
  }
};

const pike = (ctx: Ctx, x: number, y: number, size: number, lean: number): void => {
  const len = size * 0.13;
  const tx = x + Math.sin(lean) * len, ty = y - Math.cos(lean) * len;
  ctx.strokeStyle = "#5a4330"; ctx.lineWidth = Math.max(1, size * 0.016); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = "#4a4f57";
  ctx.beginPath(); ctx.moveTo(tx, ty - size * 0.025); ctx.lineTo(tx - size * 0.01, ty + size * 0.005); ctx.lineTo(tx + size * 0.01, ty + size * 0.005); ctx.closePath(); ctx.fill();
};

const shield = (ctx: Ctx, x: number, y: number, size: number, brass: boolean): void => {
  ctx.fillStyle = brass ? "#8b6c3d" : "#3a3e46";
  ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = Math.max(0.6, size * 0.008);
  ctx.beginPath(); ctx.ellipse(x, y, size * 0.04, size * 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9a05a";
  ctx.beginPath(); ctx.arc(x, y - size * 0.003, size * 0.011, 0, Math.PI * 2); ctx.fill();
};

const timbers = (ctx: Ctx, seed: number, i: number, x: number, y: number, size: number): void => {
  for (let k = 0; k < 4; k += 1) {
    ctx.save(); ctx.translate(x + (hash(seed, i + k) - 0.5) * size * 0.06, y + (hash(seed, i + k + 4) - 0.5) * size * 0.05);
    ctx.rotate(hash(seed, i + k + 8) * Math.PI);
    ctx.fillStyle = k % 2 ? "#2a2522" : "#4b3626";
    ctx.fillRect(-size * 0.08, -size * 0.011, size * 0.16, size * 0.022);
    ctx.restore();
  }
};

const wheel = (ctx: Ctx, x: number, y: number, size: number): void => {
  ctx.strokeStyle = "#5a4330"; ctx.lineWidth = Math.max(1, size * 0.013);
  ctx.beginPath(); ctx.ellipse(x, y, size * 0.055, size * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * size * 0.05, y + Math.sin(a) * size * 0.036); ctx.stroke();
  }
};

const barricade = (ctx: Ctx, x: number, y: number, size: number, turn: number): void => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn);
  ctx.strokeStyle = "#5a4330"; ctx.lineWidth = Math.max(1, size * 0.014); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-size * 0.09, 0); ctx.lineTo(size * 0.09, 0); ctx.stroke();
  for (const d of [-0.07, 0, 0.07]) {
    ctx.beginPath(); ctx.moveTo(size * d - size * 0.03, size * 0.035); ctx.lineTo(size * d + size * 0.03, -size * 0.045); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * d + size * 0.03, size * 0.035); ctx.lineTo(size * d - size * 0.03, -size * 0.045); ctx.stroke();
  }
  ctx.restore();
};

const ember = (ctx: Ctx, x: number, y: number, size: number, now: number, i: number): void => {
  const flicker = 0.55 + 0.45 * Math.sin(now / 160 + i * 2.1);
  ctx.fillStyle = `rgba(255,${150 + Math.round(70 * flicker)},80,${0.45 + 0.5 * flicker})`;
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, size * 0.012 * (0.7 + flicker)), 0, Math.PI * 2); ctx.fill();
};

const smoke = (ctx: Ctx, seed: number, x: number, y: number, size: number, now: number): void => {
  const cycle = 4200;
  for (let i = 0; i < 4; i += 1) {
    const t = ((now + (i / 4) * cycle + hash(seed, i) * 600) % cycle) / cycle;
    ctx.fillStyle = `rgba(52,47,44,${0.5 * (1 - t) * Math.min(1, t * 8)})`;
    ctx.beginPath(); ctx.arc(x + size * 0.08 * t, y - size * 0.45 * t, size * (0.04 + t * 0.09), 0, Math.PI * 2); ctx.fill();
  }
};

/** One of a fought-over forest's destroyed trees, at its anchor (tx, ty = the tree's foot). */
const burntTree = (ctx: Ctx, fate: TreeFate, tx: number, ty: number, size: number, seed: number, i: number, level: number, now: number): void => {
  scorch(ctx, tx, ty, size * 0.13, 0.55);
  const trunkW = Math.max(1, size * 0.042);
  const fall = (hash(seed, i + 700) < 0.5 ? -1 : 1) * (0.5 + hash(seed, i + 710) * 0.6);
  ctx.lineCap = "round";
  if (fate === "snag") {
    const h = size * (0.2 + hash(seed, i + 720) * 0.1);
    ctx.fillStyle = "#1f1b18";
    ctx.beginPath();
    ctx.moveTo(tx - trunkW * 0.6, ty); ctx.lineTo(tx - trunkW * 0.35, ty - h); ctx.lineTo(tx - trunkW * 0.05, ty - h + trunkW * 0.9);
    ctx.lineTo(tx + trunkW * 0.15, ty - h - trunkW * 0.6); ctx.lineTo(tx + trunkW * 0.4, ty - h + trunkW * 0.4); ctx.lineTo(tx + trunkW * 0.6, ty);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#2a2522"; ctx.lineWidth = Math.max(0.8, trunkW * 0.35);
    for (let k = 0; k < 3; k += 1) {
      const y = ty - h * (0.4 + k * 0.17);
      const side = k % 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + side * size * 0.05, y - size * 0.03); ctx.stroke();
    }
    if (level >= 3) ember(ctx, tx, ty - h * 0.55, size, now, i);
  } else if (fate === "snapped" || fate === "uprooted") {
    const len = size * 0.24;
    const ex = tx + fall * len, ey = ty - len * 0.12;
    if (fate === "snapped") {
      ctx.fillStyle = "#2a2522";
      ctx.fillRect(tx - trunkW * 0.6, ty - size * 0.04, trunkW * 1.2, size * 0.04);
    } else {
      ctx.fillStyle = "#6b4a2e"; ctx.strokeStyle = "#3a2a1c"; ctx.lineWidth = Math.max(0.6, size * 0.008);
      ctx.beginPath(); ctx.ellipse(tx, ty - size * 0.03, size * 0.025, size * 0.045, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = fate === "snapped" && level >= 3 ? "#1f1b18" : "#4b3626";
    ctx.lineWidth = trunkW;
    ctx.beginPath(); ctx.moveTo(tx + fall * trunkW, ty - size * 0.015); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = fate === "uprooted" ? "rgba(70,96,44,0.9)" : "rgba(52,44,36,0.9)";
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath(); ctx.arc(ex + fall * size * 0.02 * k, ey - size * 0.02 + k * size * 0.01, size * 0.035, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.strokeStyle = "rgba(170,165,155,0.6)"; ctx.lineWidth = Math.max(0.8, size * 0.012);
    ctx.beginPath(); ctx.ellipse(tx, ty, size * 0.05, size * 0.03, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#1f1b18";
    ctx.beginPath(); ctx.ellipse(tx, ty - size * 0.01, size * 0.025, size * 0.018, 0, 0, Math.PI * 2); ctx.fill();
    if (level >= 2) ember(ctx, tx, ty - size * 0.015, size, now, i + 3);
  }
};

/** A fought-over forest's destroyed trees, at the anchors the forest overlay leaves empty. */
export const drawForestWar2D = (ctx: Ctx, tile: Tile, px: number, py: number, size: number, level: number, now: number): void => {
  const { variant } = forestLayoutAt(tile.x, tile.y, isTropicalForestLatitudeAt(tile.y));
  const seed = tile.x * 31 + tile.y * 17;
  forestAnchorsForSize(size).forEach(([ax, ay], i) => {
    const fate = treeFate(variant, level, i);
    if (fate !== "standing") burntTree(ctx, fate, px + size * ax, py + size * ay, size, seed, i, level, now);
  });
};

export const drawWarScars2D = (ctx: Ctx, tile: Tile, px: number, py: number, size: number, nowEpochMs: number): void => {
  if (size < 6) return;
  const level = liveWarScarLevel(tile, nowEpochMs);
  if (level <= 0) return;
  const seed = tile.x * 31 + tile.y * 17;
  const at = (i: number, margin = 0.12): [number, number] =>
    [px + size * (margin + hash(seed, i) * (1 - margin * 2)), py + size * (margin + hash(seed, i + 500) * (1 - margin * 2))];
  ctx.save();
  if (level >= WAR_SCAR_MAX_LEVEL) for (let i = 0; i < 4; i += 1) { const [x, y] = at(900 + i, 0.2); scorch(ctx, x, y, size * 0.2, 0.5); }
  const craters = level === 1 ? 1 : level + Math.floor(level / 3);
  for (let i = 0; i < craters; i += 1) {
    const [x, y] = at(i, 0.16);
    crater(ctx, seed, i, x, y, size * (0.045 + hash(seed, i + 50) * 0.03 + (i === 0 ? level * 0.008 : 0)));
  }
  if (level >= 2) { const [x, y] = at(300, 0.18); timbers(ctx, seed, 300, x, y, size); }
  if (level >= 3) { const [x, y] = at(310, 0.18); wheel(ctx, x, y, size); }
  if (level >= 4) { const [x, y] = at(320, 0.2); barricade(ctx, x, y, size, hash(seed, 321) * Math.PI); }
  if (level >= WAR_SCAR_MAX_LEVEL) { const [x, y] = at(330, 0.2); barricade(ctx, x, y, size, hash(seed, 331) * Math.PI); }
  for (let i = 0; i < Math.ceil(level * 0.8); i += 1) { const [x, y] = at(100 + i); shield(ctx, x, y, size, hash(seed, 150 + i) < 0.5); }
  for (let i = 0; i < level * 2 + 1; i += 1) { const [x, y] = at(200 + i); pike(ctx, x, y, size, (hash(seed, 250 + i) - 0.5) * 1.3); }
  if (level >= 3) for (let i = 0; i < level + 1; i += 1) { const [x, y] = at(400 + i); ember(ctx, x, y, size, nowEpochMs, i); }
  if (level >= 4) { const [x, y] = at(320, 0.2); smoke(ctx, seed, x, y, size, nowEpochMs); }
  if (size >= 12 && isForestTileAt(tile.x, tile.y)) drawForestWar2D(ctx, tile, px, py, size, level, nowEpochMs);
  ctx.restore();
};
