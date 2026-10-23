import { flagCommitForTarget, musterFlagCap } from "@border-empires/shared";
import { requiredMusterWithCommit } from "../client-attack-commit/client-attack-commit.js";
import { predictedMusterAmount } from "../client-muster-prediction/client-muster-prediction.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Every muster flag of yours carries a progress badge floating over it -- a
// round enamel disc with a ring filling up and the percentage in the middle --
// so you can read at a glance how far along each flag is without opening it.
// It replaced the full-width "Mustering... N/M" capture banner a parked
// attack used to take over. What the percentage measures depends on what the
// flag is gathering for:
//   - "attack" (brass ring): a manual attack parked on the flag
//     (state.pendingMusterAttacks) -> that attack's requirement; otherwise a
//     MARCH/ADVANCE flag with a chosen commitment that its fights will
//     actually spend -> that commitment.
//   - "capacity" (verdigris ring): a HOLD flag, or ADVANCE with no chosen
//     commitment -> how full the flag is against its own cap (musterFlagCap).
// Rival flags get no badge: their amounts aren't predicted here and aren't
// ours to read exactly. Both renderers draw it from here: the 3D muster
// overlay paints drawMusterProgressBadge onto a sprite texture
// (client-map-3d-muster-progress-badge.ts), the 2D map paints it straight onto
// the canvas (drawMusterBadges2D below).

export type MusterBadgeKind = "attack" | "capacity";
export type MusterBadgeInfo = { ratio: number; kind: MusterBadgeKind; staged: number; required: number };

type MusterBadgeState = Pick<
  ClientState,
  "pendingMusterAttacks" | "tiles" | "me" | "manpower" | "manpowerCap" | "musterAmountRateByTile" | "attackCommitByTargetKey" | "domainIds"
>;

/**
 * What each flag with a parked manual attack is waiting to reach, by flag
 * tile key. When several attacks wait on one flag, the most recently queued
 * one wins -- it's the one the player just asked for, and the one Esc
 * cancels (cancelOngoingCapture).
 */
export const pendingMusterRequiredByFlag = (state: MusterBadgeState, keyFor: (x: number, y: number) => string): Map<string, number> => {
  const byFlag = new Map<string, number>();
  for (const entry of state.pendingMusterAttacks) {
    byFlag.set(entry.musterTileKey, requiredMusterWithCommit(state, state.tiles.get(keyFor(entry.targetX, entry.targetY))));
  }
  return byFlag;
};

/**
 * The badge for one tile, or undefined when it isn't one of our own flags.
 * `pendingRequired` is this flag's entry in pendingMusterRequiredByFlag.
 */
export const musterBadgeForFlag = (
  state: MusterBadgeState,
  tileKey: string,
  tile: Pick<Tile, "ownerId" | "muster"> | undefined,
  pendingRequired: number | undefined
): MusterBadgeInfo | undefined => {
  const muster = tile?.muster;
  if (!muster || muster.ownerId !== state.me) return undefined;
  // Before INIT/PLAYER_UPDATE lands the manpower cap reads 0, and every flag
  // would show a bogus empty/full badge for a moment.
  const flagCap = Math.floor(musterFlagCap(state.manpowerCap, muster.capLevel));
  if (flagCap <= 0) return undefined;
  const attackRequired = pendingRequired ?? flagCommitment(state, muster);
  if (attackRequired !== undefined && attackRequired > 0) {
    // Capped just *below* the requirement, never at or above it: the attack
    // fires off the real (non-extrapolated) amount, and the rate estimate
    // from a short first sample commonly overshoots the true tick pace -- so
    // a badge allowed to reach the requirement could sit on 100% long before
    // anything happens. A hair behind reality, never ahead of it -- and never
    // past the flag's own cap, where the server stops filling it (before a
    // capacity fit lands, or when the requirement is beyond the manpower cap).
    const cap = Math.max(muster.amount, Math.min(attackRequired - 1, flagCap));
    const staged = Math.floor(predictedMusterAmount(state.musterAmountRateByTile, tileKey, tile, state.me, cap, state.manpower));
    return { ratio: Math.max(0, Math.min(1, staged / attackRequired)), kind: "attack", staged, required: attackRequired };
  }
  // Nothing to fire at yet: how full the flag is. Accrual really does stop at
  // the cap, so reaching 100% here is honest.
  const staged = Math.floor(predictedMusterAmount(state.musterAmountRateByTile, tileKey, tile, state.me, flagCap, state.manpower));
  return { ratio: Math.max(0, Math.min(1, staged / flagCap)), kind: "capacity", staged, required: flagCap };
};

/**
 * The commitment a MARCH/ADVANCE flag's fights will actually spend, or
 * undefined. Auto-fire only spends it on commit-eligible targets
 * (flagCommitForTarget: not Planetary Defense, not undefended frontier) and
 * otherwise fires at the floor, so a MARCH on such a target isn't "gathering
 * for" the commitment at all. An ADVANCE flag's commitment is an effort
 * ratio over MUSTER_ATTACK_COST that the server scales to whichever target
 * it picks (advanceFlagCommitForTarget), not an amount it gathers toward, so
 * ADVANCE shows the capacity ring like HOLD.
 */
const flagCommitment = (state: Pick<MusterBadgeState, "tiles">, muster: NonNullable<Tile["muster"]>): number | undefined => {
  if (muster.mode !== "MARCH" || !muster.commitManpower) return undefined;
  if (muster.targetX === undefined || muster.targetY === undefined) return muster.commitManpower;
  return flagCommitForTarget(state.tiles.get(`${muster.targetX},${muster.targetY}`), muster.commitManpower, Date.now());
};

/**
 * Per-frame lookup for the 3D overlay, which already knows which flag tiles
 * are on screen: builds the parked-attack table once, then answers per flag
 * key in O(1).
 */
export const musterBadgeLookup = (
  state: MusterBadgeState,
  keyFor: (x: number, y: number) => string
): ((tileKey: string) => MusterBadgeInfo | undefined) => {
  const pending = pendingMusterRequiredByFlag(state, keyFor);
  return (tileKey) => musterBadgeForFlag(state, tileKey, state.tiles.get(tileKey), pending.get(tileKey));
};

/** Whole percent shown on the badge. Floors, so it never reads 100% early. */
export const musterBadgePercent = (ratio: number): number => Math.max(0, Math.min(100, Math.floor(ratio * 100)));

const RING_COLOR: Record<MusterBadgeKind, string> = { attack: "#d9ad52", capacity: "#7fb8a4" };

/**
 * Paints the badge -- a dark enamel disc with a brass rim, a progress ring
 * filling clockwise from 12 o'clock (brass when gathering for an attack,
 * verdigris when just filling the flag), the percentage in the middle and a
 * small pointer underneath aimed at the flag -- centred at (cx, cy). The
 * pointer's tip sits at cy + radius * 1.45.
 */
export const drawMusterProgressBadge = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  ratio: number,
  kind: MusterBadgeKind = "attack"
): void => {
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
    ctx.strokeStyle = RING_COLOR[kind];
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

// The 2D map has no list of on-screen flags the way the 3D overlay does, and
// scanning every known tile each frame is too much, so it keeps a list of
// our own flag tiles refreshed at most this often. A new or cleared flag
// shows/vanishes within that window; the percentages themselves still update
// every frame.
export const OWN_FLAG_INDEX_REFRESH_MS = 1_000;
let ownFlagIndex: { at: number; me: string | undefined; keys: string[] } = { at: Number.NEGATIVE_INFINITY, me: undefined, keys: [] };

/** Our own muster flag tile keys, re-scanned at most every OWN_FLAG_INDEX_REFRESH_MS. */
export const ownMusterFlagKeys = (state: Pick<ClientState, "tiles" | "me">, nowMs: number): readonly string[] => {
  if (ownFlagIndex.me === state.me && nowMs - ownFlagIndex.at < OWN_FLAG_INDEX_REFRESH_MS) return ownFlagIndex.keys;
  const keys: string[] = [];
  for (const [key, tile] of state.tiles) if (tile.muster?.ownerId === state.me) keys.push(key);
  ownFlagIndex = { at: nowMs, me: state.me, keys };
  return keys;
};

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

/**
 * 2D renderer: a badge above each of our own flags. worldToScreen gives the
 * tile's centre; the badge's pointer tip lands just above it so the tile
 * itself stays readable.
 */
export const drawMusterBadges2D = (
  state: MusterBadgeState,
  keyFor: (x: number, y: number) => string,
  worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D,
  size: number,
  halfW: number,
  halfH: number,
  nowMs: number
): void => {
  const flagKeys = ownMusterFlagKeys(state, nowMs);
  if (flagKeys.length === 0) return;
  const pending = pendingMusterRequiredByFlag(state, keyFor);
  const radius = musterBadgeRadius2D(size);
  for (const key of flagKeys) {
    const tile = state.tiles.get(key);
    const badge = tile ? musterBadgeForFlag(state, key, tile, pending.get(key)) : undefined;
    if (!tile || !badge) continue;
    const { sx, sy } = worldToScreen(tile.x, tile.y, size, halfW, halfH);
    const cy = sy - size * 0.15 - radius * 1.45;
    if (sx < -radius || cy < -radius * 2 || sx > ctx.canvas.width + radius || cy > ctx.canvas.height + radius) continue;
    drawMusterProgressBadge(ctx, sx, cy, radius, badge.ratio, badge.kind);
  }
};
