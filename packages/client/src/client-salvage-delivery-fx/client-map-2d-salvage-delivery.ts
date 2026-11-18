import {
  SALVAGE_RAMP_FOOT_DY,
  SALVAGE_RAMP_HINGE_DY,
  SALVAGE_DELIVERY_TOTAL_MS,
  salvageMarcherAt,
  salvageShipAt,
  type SalvageDeliveryFxEntry
} from "./client-salvage-delivery-fx.js";

// 2D canvas counterpart of the true-3D Imperial delivery
// (client-map-3d-salvage-delivery-fx.ts), sampled from the same timeline: an
// ivory-and-gold dropship drops onto the Reclamation Works on a retro-burn,
// its shadow tightening under it, lowers a ramp, and the Ancillaries march down
// and out across the House's land in its colour, fading as they go. Drawn in
// the per-tile overlay pass on the Works' tile.

/** Screen pixels per tile of height (the 2D map leans height up the screen). */
const HEIGHT_SCALE = 0.85;

type Point = { readonly x: number; readonly y: number };

/** Ship hull outline from above, nose (ramp end) to the south, in tiles. */
const HULL: readonly Point[] = [
  { x: 0, y: 0.42 }, { x: 0.17, y: 0.22 }, { x: 0.5, y: -0.04 }, { x: 0.46, y: -0.2 },
  { x: 0.16, y: -0.14 }, { x: 0.14, y: -0.4 }, { x: -0.14, y: -0.4 }, { x: -0.16, y: -0.14 },
  { x: -0.46, y: -0.2 }, { x: -0.5, y: -0.04 }, { x: -0.17, y: 0.22 }
];

const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number): void => {
  if (alpha <= 0.01 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const drawShip = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, ageMs: number): void => {
  const ship = salvageShipAt(ageMs);
  if (!ship.visible) return;
  const lift = ship.height * size * HEIGHT_SCALE;
  // Shadow tightens and darkens as the ship comes down.
  const near = Math.max(0, 1 - ship.height / 5);
  ctx.save();
  ctx.globalAlpha = ship.alpha * (0.15 + 0.35 * near);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.02, size * (0.3 + 0.25 * near), size * (0.14 + 0.1 * near), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Landing / lift-off dust.
  if (ship.dust > 0) {
    ctx.save();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const r = size * (0.35 + 0.35 * ship.dust);
      glow(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, size * 0.22, "196,178,148", 0.35 * ship.dust);
    }
    ctx.restore();
  }
  const sy = cy - lift;
  ctx.save();
  ctx.globalAlpha = ship.alpha;
  // Retro-burn under the engines: a long flame on the way down, a flicker while unloading.
  const flame = size * (0.12 + 0.5 * ship.burn) * (0.9 + 0.1 * Math.sin(ageMs / 37));
  glow(ctx, cx, sy + flame * 0.5, flame, "255,170,80", 0.85 * ship.burn);
  glow(ctx, cx, sy + flame * 0.2, flame * 0.45, "255,240,210", 0.9 * ship.burn);
  // Hull.
  ctx.beginPath();
  HULL.forEach((p, i) => {
    const x = cx + p.x * size;
    const y = sy + p.y * size;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#ece5d2";
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeStyle = "#5c4c30";
  ctx.stroke();
  // Imperial gold spine and wing bands.
  ctx.fillStyle = "#c9a64a";
  ctx.fillRect(cx - size * 0.035, sy - size * 0.38, size * 0.07, size * 0.6);
  ctx.fillRect(cx - size * 0.44, sy - size * 0.1, size * 0.88, size * 0.04);
  // Cockpit.
  ctx.fillStyle = "#24364a";
  ctx.beginPath();
  ctx.ellipse(cx, sy + size * 0.24, size * 0.06, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ramp: from the nose hinge down to the ground as it opens.
  if (ship.rampOpen > 0.02) {
    const hingeY = sy + SALVAGE_RAMP_HINGE_DY * size;
    const footY = cy + (SALVAGE_RAMP_HINGE_DY + (SALVAGE_RAMP_FOOT_DY - SALVAGE_RAMP_HINGE_DY) * ship.rampOpen) * size - lift * (1 - ship.rampOpen);
    const hw = size * 0.11;
    ctx.beginPath();
    ctx.moveTo(cx - hw, hingeY);
    ctx.lineTo(cx + hw, hingeY);
    ctx.lineTo(cx + hw * 1.1, footY);
    ctx.lineTo(cx - hw * 1.1, footY);
    ctx.closePath();
    ctx.fillStyle = "#a9a08a";
    ctx.fill();
    ctx.stroke();
    // Warm light spilling from the hold.
    glow(ctx, cx, hingeY, size * 0.16, "255,226,160", 0.6 * ship.rampOpen);
  }
  ctx.restore();
};

const drawMarchers = (ctx: CanvasRenderingContext2D, entry: SalvageDeliveryFxEntry, cx: number, cy: number, size: number, ageMs: number): void => {
  ctx.save();
  entry.marchers.forEach((target, i) => {
    const m = salvageMarcherAt(target, i, ageMs);
    if (!m.visible || m.alpha <= 0.01) return;
    const gx = cx + m.dx * size;
    const gy = cy + m.dy * size;
    const s = size * 0.11 * m.scale;
    const by = gy - m.lift * size * HEIGHT_SCALE;
    ctx.globalAlpha = m.alpha * 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(gx, gy, s * 0.8, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = m.alpha;
    // Body in the House's colour, ivory armour plates, gold helm.
    ctx.fillStyle = entry.color;
    ctx.strokeStyle = "#2b2418";
    ctx.lineWidth = Math.max(1, size * 0.012);
    ctx.beginPath();
    ctx.rect(gx - s * 0.5, by - s * 1.9, s, s * 1.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ece5d2";
    ctx.fillRect(gx - s * 0.5, by - s * 1.9, s, s * 0.35);
    ctx.fillStyle = "#c9a64a";
    ctx.beginPath();
    ctx.arc(gx, by - s * 2.25, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
};

/** Draws the delivery playing on this Works' tile, if any. */
export const drawSalvageDelivery2D = (
  ctx: CanvasRenderingContext2D,
  entry: SalvageDeliveryFxEntry | undefined,
  px: number,
  py: number,
  size: number,
  nowEpochMs: number
): void => {
  if (!entry) return;
  const age = nowEpochMs - entry.startedAt;
  if (age < 0 || age >= SALVAGE_DELIVERY_TOTAL_MS) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  drawShip(ctx, cx, cy, size, age);
  drawMarchers(ctx, entry, cx, cy, size, age);
};
