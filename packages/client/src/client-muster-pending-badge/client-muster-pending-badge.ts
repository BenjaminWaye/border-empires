import { requiredMusterWithCommit } from "../client-attack-commit/client-attack-commit.js";
import { predictedMusterAmount } from "../client-muster-prediction/client-muster-prediction.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// A manual attack parked on a muster flag that hasn't staged enough yet
// (state.pendingMusterAttacks, see processPendingMusterAttacks) is shown as a
// progress badge floating over that flag -- a brass ring filling up with the
// percentage in the middle -- rather than the full-width "Mustering... N/M"
// capture banner it used to take over. The flag is where the troops are
// gathering, so that's where the progress belongs, and several flags can
// each show their own. Both renderers draw it from here: the 3D muster
// overlay paints drawMusterProgressBadge onto a sprite texture
// (client-map-3d-muster-progress-badge.ts), the 2D map paints it straight
// onto the canvas (drawPendingMusterBadges2D below).

export type PendingMusterBadge = {
  /** The flag's tile key -- what the badge floats over. */
  tileKey: string;
  x: number;
  y: number;
  staged: number;
  required: number;
  /** staged / required, 0-1. */
  ratio: number;
};

type PendingBadgeState = Pick<
  ClientState,
  "pendingMusterAttacks" | "tiles" | "me" | "manpower" | "musterAmountRateByTile" | "attackCommitByTargetKey" | "domainIds"
>;

// Capped just *below* `required`, never at or above it: promotion out of
// pendingMusterAttacks is driven by the real (non-extrapolated) amount, so
// if this were allowed to reach `required` the badge could show 100% for a
// long stretch before the real value actually gets there — the rate
// estimate from a short first sample commonly overshoots the true tick
// pace. Capping just under required keeps the badge always a hair behind
// reality instead of ever lying ahead of it. See client-muster-prediction.ts
// for the shared interpolation this and every other muster display uses.
const extrapolatedMusterAmount = (
  state: Pick<ClientState, "musterAmountRateByTile" | "me" | "manpower">,
  musterTileKey: string,
  musterTile: Pick<Tile, "ownerId" | "muster"> | undefined,
  required: number
): number => {
  const cap = required > 0 ? Math.max(musterTile?.muster?.amount ?? 0, required - 1) : (musterTile?.muster?.amount ?? 0);
  return predictedMusterAmount(state.musterAmountRateByTile, musterTileKey, musterTile, state.me, cap, state.manpower);
};

/**
 * One badge per flag with a parked attack. When several attacks wait on the
 * same flag, the most recently queued one wins -- it's the one the player
 * just asked for, and the one Esc cancels (cancelOngoingCapture).
 */
export const pendingMusterBadges = (state: PendingBadgeState, keyFor: (x: number, y: number) => string): PendingMusterBadge[] => {
  const byFlag = new Map<string, PendingMusterBadge>();
  for (const entry of state.pendingMusterAttacks) {
    const flagTile = state.tiles.get(entry.musterTileKey);
    // A flag just requested for this attack hasn't arrived from the server
    // yet; there's nothing on the map to float over until it does.
    if (!flagTile?.muster || flagTile.muster.ownerId !== state.me) continue;
    const required = requiredMusterWithCommit(state, state.tiles.get(keyFor(entry.targetX, entry.targetY)));
    const staged = Math.floor(extrapolatedMusterAmount(state, entry.musterTileKey, flagTile, required));
    const ratio = Math.max(0, Math.min(1, required > 0 ? staged / required : 1));
    byFlag.set(entry.musterTileKey, { tileKey: entry.musterTileKey, x: flagTile.x, y: flagTile.y, staged, required, ratio });
  }
  return [...byFlag.values()];
};

/** pendingMusterBadges as tileKey -> ratio, the shape the 3D overlay looks flags up by. */
export const pendingMusterBadgeRatios = (state: PendingBadgeState, keyFor: (x: number, y: number) => string): Map<string, number> =>
  new Map(pendingMusterBadges(state, keyFor).map((badge) => [badge.tileKey, badge.ratio]));

/** Whole percent shown on the badge. Floors, so it never reads 100% before the attack actually fires. */
export const musterBadgePercent = (ratio: number): number => Math.max(0, Math.min(100, Math.floor(ratio * 100)));

/**
 * Paints the badge -- a dark enamel disc with a brass rim, a brass progress
 * ring filling clockwise from 12 o'clock, the percentage in the middle and a
 * small pointer underneath aimed at the flag -- centred at (cx, cy). The
 * pointer's tip sits at cy + radius * 1.45.
 */
export const drawMusterProgressBadge = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, ratio: number): void => {
  const rim = Math.max(1.5, radius * 0.1);
  ctx.save();
  // Pointer under the disc, drawn first so the disc's rim covers its base.
  ctx.fillStyle = "#8a611f";
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.32, cy + radius * 0.85);
  ctx.lineTo(cx + radius * 0.32, cy + radius * 0.85);
  ctx.lineTo(cx, cy + radius * 1.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(20, 16, 10, 0.94)";
  ctx.strokeStyle = "#8a611f";
  ctx.lineWidth = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - rim / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const ringRadius = radius * 0.72;
  const ringWidth = Math.max(2, radius * 0.18);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = "rgba(244, 223, 166, 0.14)";
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  if (ratio > 0) {
    ctx.strokeStyle = "#d9ad52";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio));
    ctx.stroke();
  }

  const label = `${musterBadgePercent(ratio)}%`;
  ctx.fillStyle = "#f2e8d3";
  ctx.font = `700 ${Math.round(radius * (label.length > 3 ? 0.56 : 0.66))}px "Space Mono", Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + radius * 0.04);
  ctx.restore();
};

/** Badge radius on the 2D map: tracks the tile size, but never so small the number can't be read. */
export const musterBadgeRadius2D = (size: number): number => Math.max(14, Math.min(20, size * 0.4));

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

/**
 * 2D renderer: one badge above each flag with a parked attack. worldToScreen
 * gives the tile's centre; the badge's pointer tip lands just above it so
 * the tile itself stays readable.
 */
export const drawPendingMusterBadges2D = (
  state: PendingBadgeState,
  keyFor: (x: number, y: number) => string,
  worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const badges = pendingMusterBadges(state, keyFor);
  if (badges.length === 0) return;
  const radius = musterBadgeRadius2D(size);
  for (const badge of badges) {
    const { sx, sy } = worldToScreen(badge.x, badge.y, size, halfW, halfH);
    const cy = sy - size * 0.15 - radius * 1.45;
    if (sx < -radius || sy < -radius || sx > ctx.canvas.width + radius || cy > ctx.canvas.height + radius) continue;
    drawMusterProgressBadge(ctx, sx, cy, radius, badge.ratio);
  }
};
