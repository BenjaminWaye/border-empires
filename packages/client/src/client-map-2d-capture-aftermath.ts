// 2D canvas capture aftermath, counterpart of the true-3D wrecks
// (client-map-3d-capture-aftermath-fx.ts, client-wreck-models/; rules in
// client-capture-aftermath.ts). Each wreck is drawn from the structure's own
// pieces and colours, until the capturing troops' hold ends:
//   - Relay Beacon: its octagonal plate, the pedestal with the column snapped
//     off, the column down across the plate with its brass collars, projector
//     panels and glass shards, bent sensing frames, sputtering aether;
//   - Siege Battery: undercarriage, hull on its side, cannon thrown clear;
//     Siege / Dread Tower: legs down, gimbal rings fallen, the lens shattered;
//   - breached fort (drawFortBreach2D, over the fort sprite): a wall section collapsed
//     with its stone spilled through the gap and a corner tower toppled;
//   - captured dock: its harbour ablaze, flames, embers and smoke;
//   - captured resource: scorched ground, flames, embers, rising smoke.
import { captureAftermathForTile, type CaptureRubbleKind } from "./client-capture-aftermath/client-capture-aftermath.js";
import type { Tile } from "./client-types.js";

type Ctx = CanvasRenderingContext2D;

const hash = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const FORT_STONE: Record<string, { wall: string; tower: string; dark: string }> = {
  PALISADE: { wall: "#8a6a47", tower: "#9a7a55", dark: "#5a4430" },
  FORT: { wall: "#aea99c", tower: "#b8b3a4", dark: "#7b776c" },
  TITANIUM_BASTION: { wall: "#9aa7b3", tower: "#b0bdc9", dark: "#6c7883" },
  THUNDER_BASTION: { wall: "#4e5864", tower: "#5e6874", dark: "#323a44" }
};

const scorch = (ctx: Ctx, cx: number, cy: number, r: number, alpha = 0.7): void => {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(20,16,13,${alpha})`);
  g.addColorStop(0.65, `rgba(34,27,21,${alpha * 0.55})`);
  g.addColorStop(1, "rgba(34,27,21,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
};

/** Thick rounded stroke: a fallen column, barrel or beam. */
const beam = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, color: string): void => {
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = width + 1.5;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
};

/** A band across a beam at `f` along it. */
const band = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, f: number, width: number, color: string): void => {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.beginPath(); ctx.moveTo(cx - nx * width * 0.62, cy - ny * width * 0.62); ctx.lineTo(cx + nx * width * 0.62, cy + ny * width * 0.62); ctx.stroke();
};

const chunk = (ctx: Ctx, cx: number, cy: number, w: number, color: string, turn: number): void => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(turn);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(0.5, w * 0.12);
  ctx.beginPath();
  ctx.moveTo(-w / 2, w * 0.3); ctx.lineTo(-w * 0.35, -w * 0.32); ctx.lineTo(w * 0.42, -w * 0.25); ctx.lineTo(w / 2, w * 0.3);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
};

const octagon = (ctx: Ctx, cx: number, cy: number, r: number, squash: number, color: string, width: number): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let k = 0; k <= 8; k += 1) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * squash;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
};

const embers = (ctx: Ctx, seed: number, px: number, py: number, size: number, count: number, now: number): void => {
  for (let i = 0; i < count; i += 1) {
    const flicker = 0.55 + 0.45 * Math.sin(now / 170 + i * 2.3 + seed);
    ctx.fillStyle = `rgba(255,${150 + Math.round(60 * flicker)},80,${0.5 + flicker * 0.5})`;
    ctx.beginPath();
    ctx.arc(px + size * (0.2 + hash(seed, i + 90) * 0.6), py + size * (0.35 + hash(seed, i + 95) * 0.5), Math.max(0.8, size * 0.014 * (0.7 + flicker)), 0, Math.PI * 2);
    ctx.fill();
  }
};

const spark = (ctx: Ctx, x: number, y: number, size: number, now: number, seed: number): void => {
  const pulse = 0.5 + 0.5 * Math.sin(now / 90 + seed);
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.09);
  g.addColorStop(0, `rgba(190,250,255,${0.6 + pulse * 0.4})`);
  g.addColorStop(1, "rgba(120,230,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, size * 0.09, 0, Math.PI * 2); ctx.fill();
};

const smoke = (ctx: Ctx, seed: number, x: number, y: number, size: number, now: number, puffs = 5, scale = 1): void => {
  const cycle = 3600;
  for (let i = 0; i < puffs; i += 1) {
    const t = ((now + (i / puffs) * cycle + hash(seed, i) * 500) % cycle) / cycle;
    const r = size * (0.05 + t * 0.13) * scale;
    ctx.fillStyle = `rgba(${48 + i * 4},${44 + i * 3},${42 + i * 3},${0.6 * (1 - t) * Math.min(1, t * 8)})`;
    ctx.beginPath();
    ctx.arc(x + size * (0.1 * t + Math.sin(t * 6 + i) * 0.025), y - size * 0.65 * t * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const relayBeaconWreck = (ctx: Ctx, seed: number, px: number, py: number, s: number, now: number): void => {
  const cx = px + s * 0.5, cy = py + s * 0.5;
  // The foundation plate, scorched.
  ctx.fillStyle = "#7d7f84";
  ctx.beginPath();
  for (let k = 0; k <= 8; k += 1) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x = cx + Math.cos(a) * s * 0.38, y = cy + Math.sin(a) * s * 0.3;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.fill();
  scorch(ctx, cx + s * 0.05, cy + s * 0.04, s * 0.32);
  // Projector panels torn down, glass shattered round them.
  for (let i = 0; i < 3; i += 1) {
    const a = ((i * 120 + 50) * Math.PI) / 180;
    const x = cx + Math.cos(a) * s * 0.3, y = cy + Math.sin(a) * s * 0.24;
    chunk(ctx, x, y, s * 0.16, "#3a3e46", a);
    for (let k = 0; k < 4; k += 1) chunk(ctx, x + (hash(seed, i * 7 + k) - 0.5) * s * 0.12, y + (hash(seed, i * 7 + k + 3) - 0.5) * s * 0.1, s * 0.04, "#8fb6c8", hash(seed, k) * 3);
  }
  octagon(ctx, cx - s * 0.2, cy + s * 0.08, s * 0.1, 0.55, "#c9a05a", Math.max(1, s * 0.018));
  octagon(ctx, cx + s * 0.14, cy - s * 0.18, s * 0.07, 0.6, "#8b6c3d", Math.max(1, s * 0.015));
  // The column down across the plate, its collars, the cap rolled away.
  const x0 = cx + s * 0.04, y0 = cy - s * 0.02, x1 = cx + s * 0.36, y1 = cy + s * 0.22;
  beam(ctx, x0, y0, x1, y1, s * 0.11, "#25282e");
  band(ctx, x0, y0, x1, y1, 0.45, s * 0.12, "#8b6c3d");
  band(ctx, x0, y0, x1, y1, 0.9, s * 0.12, "#8b6c3d");
  ctx.fillStyle = "#3a3e46";
  ctx.beginPath(); ctx.ellipse(cx + s * 0.3, cy - s * 0.2, s * 0.07, s * 0.05, 0.5, 0, Math.PI * 2); ctx.fill();
  // Pedestal and the jagged stump.
  ctx.fillStyle = "#5d6066";
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#25282e";
  ctx.beginPath();
  for (let k = 0; k < 14; k += 1) {
    const a = (k / 14) * Math.PI * 2;
    const r = s * (k % 2 === 0 ? 0.085 : 0.06);
    const x = cx + Math.cos(a) * r, y = cy - s * 0.03 + Math.sin(a) * r * 0.8;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  spark(ctx, cx, cy - s * 0.04, s, now, seed);
  embers(ctx, seed, px, py, s, 6, now);
  smoke(ctx, seed, cx, cy - s * 0.06, s, now, 6, 1.1);
};

const siegeWreck = (ctx: Ctx, kind: CaptureRubbleKind, seed: number, px: number, py: number, s: number, now: number): void => {
  const cx = px + s * 0.5, cy = py + s * 0.52;
  scorch(ctx, cx, cy, s * 0.4);
  if (kind === "SIEGE_BATTERY") {
    chunk(ctx, cx - s * 0.02, cy + s * 0.02, s * 0.62, "#23262e", 0.12);
    // Hull on its side.
    ctx.save(); ctx.translate(cx - s * 0.12, cy - s * 0.05); ctx.rotate(0.5);
    ctx.fillStyle = "#101116"; ctx.fillRect(-s * 0.22, -s * 0.1, s * 0.44, s * 0.2);
    ctx.fillStyle = "#8a7440"; ctx.fillRect(-s * 0.22, s * 0.07, s * 0.44, s * 0.03);
    ctx.restore();
    const x0 = cx + s * 0.02, y0 = cy + s * 0.2, x1 = cx + s * 0.36, y1 = cy - s * 0.02;
    beam(ctx, x0, y0, x1, y1, s * 0.07, "#525a66");
    band(ctx, x0, y0, x1, y1, 0.3, s * 0.08, "#b3924f");
    band(ctx, x0, y0, x1, y1, 0.7, s * 0.08, "#b3924f");
    spark(ctx, cx + s * 0.28, cy + s * 0.3, s * 0.8, now, seed);
  } else {
    const dread = kind === "DREAD_TOWER";
    ctx.fillStyle = dread ? "#101116" : "#191b20";
    ctx.fillRect(cx - s * 0.2, cy - s * 0.15, s * 0.4, s * 0.3);
    beam(ctx, cx - s * 0.1, cy, cx - s * 0.42, cy + s * 0.3, s * 0.06, "#23252c");
    beam(ctx, cx + s * 0.05, cy - s * 0.05, cx + s * 0.4, cy - s * 0.28, s * 0.06, "#23252c");
    ctx.strokeStyle = dread ? "#6f5f40" : "#9b7b51";
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath(); ctx.ellipse(cx - s * 0.1, cy + s * 0.14, s * 0.24, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 9; i += 1) {
      chunk(ctx, cx - s * 0.1 + (hash(seed, i) - 0.5) * s * 0.3, cy + s * 0.14 + (hash(seed, i + 9) - 0.5) * s * 0.16, s * 0.05, dread ? "#d070f0" : "#9feaff", hash(seed, i + 3) * 3);
    }
    spark(ctx, cx - s * 0.1, cy + s * 0.14, s * (dread ? 1.3 : 1), now, seed);
  }
  for (let i = 0; i < 8; i += 1) chunk(ctx, cx + (hash(seed, i + 30) - 0.5) * s * 0.7, cy + (hash(seed, i + 40) - 0.5) * s * 0.6, s * 0.045, "#3a3f49", hash(seed, i) * 3);
  embers(ctx, seed, px, py, s, 7, now);
  smoke(ctx, seed, cx - s * 0.06, cy - s * 0.08, s, now, 6, 1.1);
};

/** Painted over a breached fort's own sprite (drawTileFortificationOverlays2D): the smashed wall section and toppled tower. */
export const drawFortBreach2D = (ctx: Ctx, tile: Tile, px: number, py: number, s: number, now: number): void => {
  if (s < 8) return;
  const seed = tile.x * 17 + tile.y * 31;
  ctx.save();
  const stone = FORT_STONE[tile.fort?.variant ?? "FORT"] ?? FORT_STONE.FORT!;
  const side = Math.abs(Math.floor(seed)) % 4;
  // Gap centre on the wall, and the inward direction.
  const gap = [[0.5, 0.06, 0, 1], [0.94, 0.5, -1, 0], [0.5, 0.94, 0, -1], [0.06, 0.5, 1, 0]][side]!;
  const gx = px + s * gap[0]!, gy = py + s * gap[1]!;
  scorch(ctx, gx + gap[2]! * s * 0.12, gy + gap[3]! * s * 0.12, s * 0.26);
  for (let i = 0; i < 16; i += 1) {
    const inward = hash(seed, i) * 0.3 - 0.05;
    const lateral = (hash(seed, i + 20) - 0.5) * (0.24 + inward);
    const x = gx + gap[2]! * s * inward + Math.abs(gap[3]!) * s * lateral;
    const y = gy + gap[3]! * s * inward + Math.abs(gap[2]!) * s * lateral;
    chunk(ctx, x, y, s * (0.05 + hash(seed, i + 40) * 0.06), i % 3 === 0 ? stone.dark : stone.wall, hash(seed, i + 60) * 3);
  }
  // The corner tower beside the gap, toppled inward.
  const corner = [[0.92, 0.08], [0.92, 0.92], [0.08, 0.92], [0.08, 0.08]][side]!;
  const tx = px + s * corner[0]!, ty = py + s * corner[1]!;
  ctx.save(); ctx.translate(tx + gap[2]! * s * 0.18, ty + gap[3]! * s * 0.18); ctx.rotate(Math.atan2(gap[3]!, gap[2]!) + 0.25);
  ctx.fillStyle = stone.tower; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = Math.max(0.5, s * 0.012);
  ctx.fillRect(-s * 0.13, -s * 0.07, s * 0.26, s * 0.14); ctx.strokeRect(-s * 0.13, -s * 0.07, s * 0.26, s * 0.14);
  ctx.restore();
  embers(ctx, seed, gx - s * 0.5 + gap[2]! * s * 0.1, gy - s * 0.5 + gap[3]! * s * 0.1, s * 0.5, 4, now);
  smoke(ctx, seed, gx + gap[2]! * s * 0.08, gy + gap[3]! * s * 0.08, s, now, 5, 1);
  ctx.restore();
};

/** A tongue of flame standing on (x, y), wavering and flickering. */
const flame = (ctx: Ctx, x: number, y: number, size: number, now: number, i: number): void => {
  const flicker = 0.75 + 0.25 * Math.sin(now / 110 + i * 1.9);
  const sway = Math.sin(now / 260 + i * 2.7) * size * 0.25;
  const h = size * (1.6 + 0.5 * Math.sin(now / 150 + i)) * flicker;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.4);
  glow.addColorStop(0, `rgba(255,120,40,${0.35 * flicker})`);
  glow.addColorStop(1, "rgba(255,90,30,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, size * 2.4, 0, Math.PI * 2); ctx.fill();
  for (const [scale, color] of [[1, `rgba(230,70,30,${0.9 * flicker})`], [0.66, `rgba(255,160,50,${0.95 * flicker})`], [0.35, "rgba(255,235,140,0.95)"]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.6 * scale, y);
    ctx.quadraticCurveTo(x - size * 0.7 * scale, y - h * 0.5 * scale, x + sway * scale, y - h * scale);
    ctx.quadraticCurveTo(x + size * 0.7 * scale, y - h * 0.5 * scale, x + size * 0.6 * scale, y);
    ctx.closePath(); ctx.fill();
  }
};

/** A captured dock ablaze: its buildings, freight, pier and ferry burning. */
const dockFire = (ctx: Ctx, seed: number, px: number, py: number, s: number, now: number): void => {
  scorch(ctx, px + s * 0.5, py + s * 0.55, s * 0.32, 0.6);
  const spots: ReadonlyArray<readonly [number, number, number]> = [[0.3, 0.38, 0.07], [0.42, 0.34, 0.05], [0.55, 0.55, 0.06], [0.7, 0.66, 0.05], [0.36, 0.72, 0.055]];
  spots.forEach(([fx, fy, size], i) => flame(ctx, px + s * fx, py + s * fy, s * size, now, i + seed));
  embers(ctx, seed, px, py, s, 5, now);
  smoke(ctx, seed, px + s * 0.32, py + s * 0.3, s, now, 7, 1.25);
  smoke(ctx, seed + 3, px + s * 0.38, py + s * 0.66, s, now, 5, 0.9);
};

const resourceFire = (ctx: Ctx, seed: number, px: number, py: number, s: number, now: number): void => {
  scorch(ctx, px + s * 0.58, py + s * 0.6, s * 0.22, 0.6);
  scorch(ctx, px + s * 0.38, py + s * 0.48, s * 0.16, 0.5);
  embers(ctx, seed, px, py, s, 6, now);
  flame(ctx, px + s * 0.58, py + s * 0.6, s * 0.045, now, seed);
  flame(ctx, px + s * 0.38, py + s * 0.48, s * 0.035, now, seed + 1);
  smoke(ctx, seed, px + s * 0.55, py + s * 0.55, s, now, 6, 1.1);
  smoke(ctx, seed + 7, px + s * 0.38, py + s * 0.5, s, now, 4, 0.8);
};

export const drawCaptureAftermath2D = (ctx: Ctx, tile: Tile, tileKey: string, px: number, py: number, size: number, nowEpochMs: number): void => {
  if (size < 8) return;
  const aftermath = captureAftermathForTile(tile, tileKey, nowEpochMs);
  if (!aftermath) return;
  const seed = tile.x * 17 + tile.y * 31;
  ctx.save();
  for (const kind of aftermath.rubble) {
    if (kind === "RELAY_BEACON") relayBeaconWreck(ctx, seed, px, py, size, nowEpochMs);
    // A breached fort is painted over its own sprite by drawFortBreach2D.
    else if (kind !== "FORT") siegeWreck(ctx, kind, seed, px, py, size, nowEpochMs);
  }
  if (aftermath.burningDock) dockFire(ctx, seed, px, py, size, nowEpochMs);
  else if (aftermath.smoke) resourceFire(ctx, seed, px, py, size, nowEpochMs);
  ctx.restore();
};
