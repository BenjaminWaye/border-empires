import {
  SALVAGE_DELIVERY_TOTAL_MS,
  SALVAGE_RAMP_FOOT_DY,
  SALVAGE_RAMP_HINGE_DY,
  SALVAGE_SHIP_ORBIT_HEIGHT,
  salvageMarcherAt,
  salvageNavLight,
  salvageShipAt,
  type SalvageDeliveryFxEntry
} from "./client-salvage-delivery-fx.js";

// 2D canvas counterpart of the true-3D Imperial delivery
// (client-map-3d-salvage-delivery-fx.ts), sampled from the same timeline:
// the Court's ivory-and-gold dropship dives in from the north wrapped in a
// re-entry streak, brakes on its lift thrusters over the Reclamation Works
// (shadow tightening under it, dust billowing), runs its ramp out, and the
// Ancillaries march down and off across the House's land, fading as they go.
// The Ancillaries are drawn as the game's own 2D soldier figure (the same
// owner-coloured body-and-head the capture-hold garrison uses,
// client-map-2d-capture-hold-overlay.ts). Drawn in the per-tile overlay pass
// on the Works' tile.

/** Screen pixels per tile of height (the 2D map leans height up the screen). */
const HEIGHT_SCALE = 0.85;

type Point = readonly [number, number];
/** Hull outline from above (x east, y south = toward the nose), right half; matches the 3D hull. */
const HULL_RIGHT: readonly Point[] = [
  [0, 0.56], [0.08, 0.46], [0.15, 0.24], [0.2, 0.1], [0.6, -0.16], [0.6, -0.24],
  [0.48, -0.27], [0.22, -0.22], [0.2, -0.46], [0.09, -0.56], [0, -0.56]
];
const DECK_RIGHT: readonly Point[] = [[0, 0.44], [0.09, 0.32], [0.12, 0.05], [0.12, -0.36], [0.07, -0.52], [0, -0.52]];
const LIFT_THRUSTERS: readonly Point[] = [[-0.4, -0.13], [0.4, -0.13], [-0.08, 0.26], [0.08, 0.26]];
const NAV_LIGHTS: ReadonlyArray<readonly [number, number, string]> = [[-0.6, -0.2, "255,59,48"], [0.6, -0.2, "59,255,106"], [0, -0.3, "255,255,255"]];

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

const outlinePath = (ctx: CanvasRenderingContext2D, right: readonly Point[], cx: number, cy: number, size: number): void => {
  const ring = [...right, ...[...right].reverse().map(([x, y]) => [-x, y] as Point)];
  ctx.beginPath();
  ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x * size, cy + y * size) : ctx.lineTo(cx + x * size, cy + y * size)));
  ctx.closePath();
};

const drawShip = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, ageMs: number): void => {
  const ship = salvageShipAt(ageMs);
  if (!ship.visible) return;
  const gx = cx;
  const gy = cy + ship.offsetDy * size;
  const lift = ship.height * size * HEIGHT_SCALE;
  const near = Math.max(0, 1 - ship.height / SALVAGE_SHIP_ORBIT_HEIGHT);

  // Shadow on the ground, tightening as the ship comes down.
  ctx.save();
  ctx.globalAlpha = ship.alpha * (0.1 + 0.4 * near * near);
  ctx.fillStyle = "#000";
  outlinePath(ctx, HULL_RIGHT, gx, gy + size * 0.04, size * (0.55 + 0.4 * near));
  ctx.fill();
  ctx.restore();

  // Thruster wash and dust round the Works.
  ctx.save();
  glow(ctx, gx, gy, size * 0.6, "255,178,102", 0.45 * ship.burn * near * near * ship.alpha);
  if (ship.dust > 0) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + i;
      const r = size * (0.45 + 0.6 * ship.dust) * (0.7 + 0.3 * Math.sin(i * 7.3));
      glow(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, size * (0.25 + 0.15 * ship.dust), "190,172,148", 0.4 * ship.dust);
    }
  }
  ctx.restore();

  const sx = gx;
  const sy = gy - lift;
  ctx.save();
  ctx.globalAlpha = ship.alpha;

  // Re-entry streak trailing back up the dive (up and to the north on screen).
  if (ship.heat > 0.01) {
    const tail = size * 2.6 * (0.4 + 0.6 * ship.heat);
    const trail = ctx.createLinearGradient(sx, sy, sx, sy - tail);
    trail.addColorStop(0, `rgba(255,250,235,${0.95 * ship.heat})`);
    trail.addColorStop(0.25, `rgba(255,200,120,${0.75 * ship.heat})`);
    trail.addColorStop(1, "rgba(150,70,30,0)");
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(sx - size * 0.55, sy);
    ctx.quadraticCurveTo(sx, sy + size * 0.7, sx + size * 0.55, sy);
    ctx.lineTo(sx + size * 0.18, sy - tail);
    ctx.lineTo(sx - size * 0.18, sy - tail);
    ctx.closePath();
    ctx.fill();
    glow(ctx, sx, sy + size * 0.2, size * 0.9, "255,214,160", 0.8 * ship.heat);
  }

  // Lift-thruster plumes, then the rear engines.
  const flicker = 0.88 + 0.12 * Math.sin(ageMs / 29) * Math.sin(ageMs / 47);
  for (const [tx, ty] of LIFT_THRUSTERS) {
    const px = sx + tx * size;
    const py = sy + ty * size;
    const len = size * (0.1 + 0.55 * ship.burn) * flicker;
    glow(ctx, px, py + len * 0.45, len * 0.8, "255,165,80", 0.8 * ship.burn);
    glow(ctx, px, py + len * 0.15, len * 0.35, "255,245,220", 0.95 * ship.burn);
  }
  for (const side of [-1, 1]) glow(ctx, sx + side * 0.1 * size, sy - 0.6 * size, size * 0.16, "255,217,160", (0.4 + 0.5 * ship.burn) * flicker);

  // Hull: shaded ivory with a dark outline, a raised deck, gold trim.
  const hullShade = ctx.createLinearGradient(sx - size * 0.6, sy - size * 0.5, sx + size * 0.6, sy + size * 0.5);
  hullShade.addColorStop(0, "#fbf7ec");
  hullShade.addColorStop(0.55, "#e2dccb");
  hullShade.addColorStop(1, "#a9a291");
  outlinePath(ctx, HULL_RIGHT, sx, sy, size);
  ctx.fillStyle = hullShade;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.strokeStyle = "#3e3524";
  ctx.stroke();
  // Gold leading edges.
  ctx.strokeStyle = "#caa547";
  ctx.lineWidth = Math.max(1, size * 0.03);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx + side * 0.2 * size, sy + 0.1 * size);
    ctx.lineTo(sx + side * 0.6 * size, sy - 0.16 * size);
    ctx.stroke();
  }
  const deckShade = ctx.createLinearGradient(sx - size * 0.12, 0, sx + size * 0.12, 0);
  deckShade.addColorStop(0, "#ffffff");
  deckShade.addColorStop(1, "#cfc8b6");
  outlinePath(ctx, DECK_RIGHT, sx, sy - size * 0.03, size);
  ctx.fillStyle = deckShade;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.strokeStyle = "rgba(62,53,36,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#caa547";
  ctx.fillRect(sx - size * 0.022, sy - size * 0.45, size * 0.044, size * 0.6);
  // Canopy with a highlight.
  ctx.fillStyle = "#13283a";
  ctx.beginPath();
  ctx.ellipse(sx, sy + size * 0.22, size * 0.065, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(170,220,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(sx - size * 0.02, sy + size * 0.17, size * 0.018, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights.
  NAV_LIGHTS.forEach(([lx, ly, rgb], i) => {
    const on = salvageNavLight(ageMs, i);
    glow(ctx, sx + lx * size, sy + ly * size, size * 0.12, rgb, on);
  });

  // Ramp: from the nose hinge down to the ground as it runs out, lit from the hold.
  if (ship.rampOpen > 0.02) {
    const hingeY = sy + SALVAGE_RAMP_HINGE_DY * size;
    const footY = gy + (SALVAGE_RAMP_HINGE_DY + (SALVAGE_RAMP_FOOT_DY - SALVAGE_RAMP_HINGE_DY) * ship.rampOpen) * size - lift * (1 - ship.rampOpen);
    const hw = size * 0.11;
    const rampShade = ctx.createLinearGradient(0, hingeY, 0, footY);
    rampShade.addColorStop(0, "#d9cfb3");
    rampShade.addColorStop(1, "#8f887a");
    ctx.beginPath();
    ctx.moveTo(sx - hw, hingeY);
    ctx.lineTo(sx + hw, hingeY);
    ctx.lineTo(sx + hw * 1.1, footY);
    ctx.lineTo(sx - hw * 1.1, footY);
    ctx.closePath();
    ctx.fillStyle = rampShade;
    ctx.fill();
    ctx.strokeStyle = "#3e3524";
    ctx.lineWidth = Math.max(1, size * 0.015);
    ctx.stroke();
    glow(ctx, sx, hingeY, size * 0.22, "255,226,160", 0.7 * ship.rampOpen);
  }
  ctx.restore();
};

/** The game's 2D soldier figure (as the capture-hold garrison draws it), walking. */
const drawMarchers = (ctx: CanvasRenderingContext2D, entry: SalvageDeliveryFxEntry, cx: number, cy: number, size: number, ageMs: number): void => {
  const unit = size / 10;
  ctx.save();
  ctx.lineWidth = Math.max(1, unit * 0.35);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  entry.marchers.forEach((target, i) => {
    const m = salvageMarcherAt(target, i, ageMs);
    if (!m.visible || m.alpha <= 0.01) return;
    const gx = cx + m.dx * size;
    const gy = cy + m.dy * size;
    const u = unit * m.scale;
    const baseY = gy - m.lift * size * HEIGHT_SCALE;
    ctx.globalAlpha = m.alpha * 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(gx, gy, u * 0.9, u * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = m.alpha;
    ctx.fillStyle = entry.color;
    ctx.beginPath();
    ctx.rect(gx - u * 0.7, baseY - u * 2.2, u * 1.4, u * 2.2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(gx, baseY - u * 2.9, u * 0.65, 0, Math.PI * 2);
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
