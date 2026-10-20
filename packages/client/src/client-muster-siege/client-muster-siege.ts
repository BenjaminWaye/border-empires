import { COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE, MUSTER_UNDER_SIEGE_MESSAGE } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type SiegeState = Pick<ClientState, "incomingAttacksByTile" | "tiles" | "me">;

/** An enemy fight currently targeting one of this player's own tiles. */
export type OwnTileSiege = {
  x: number;
  y: number;
  attackerName: string;
  resolvesAt: number;
};

/**
 * The enemy attack (if any) pinning this player's tile at (x, y). The server
 * locks the target of a fight from the moment it is accepted (including the
 * attacker's march) until it resolves, and a locked tile can't launch an
 * attack, fund one from its muster flag, or have that flag cleared. Read from
 * ATTACK_ALERT's incomingAttacksByTile, the same source as the red
 * under-attack cross, so the lock and the cross always agree.
 */
export const ownTileSiegeAt = (state: SiegeState, x: number, y: number, nowMs: number): OwnTileSiege | undefined => {
  const key = `${x},${y}`;
  const incoming = state.incomingAttacksByTile.get(key);
  if (!incoming || incoming.resolvesAt <= nowMs || !state.me) return undefined;
  if (state.tiles.get(key)?.ownerId !== state.me) return undefined;
  return { x, y, attackerName: incoming.attackerName, resolvesAt: incoming.resolvesAt };
};

export const formatSiegeRemaining = (ms: number): string => {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
};

/** Short reason shown on a greyed-out muster action. */
export const musterSiegeReason = (siege: OwnTileSiege, nowMs: number): string =>
  `Under siege by ${siege.attackerName} — free in ${formatSiegeRemaining(siege.resolvesAt - nowMs)}`;

const NEIGHBOR_OFFSETS = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]
] as const;

/**
 * The besieged own tile next to (targetX, targetY) that frees up first --
 * when a LOCKED rejection says our launch tile is under attack, this is the
 * tile (usually the muster flag) the player needs to hear about.
 */
export const besiegedOwnNeighborOf = (
  state: SiegeState,
  targetX: number,
  targetY: number,
  nowMs: number,
  wrap: (x: number, y: number) => { x: number; y: number }
): OwnTileSiege | undefined => {
  let best: OwnTileSiege | undefined;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const { x, y } = wrap(targetX + dx, targetY + dy);
    const siege = ownTileSiegeAt(state, x, y, nowMs);
    if (siege && (!best || siege.resolvesAt < best.resolvesAt)) best = siege;
  }
  return best;
};

/**
 * Player-facing text for a LOCKED / MUSTER_UNDER_SIEGE rejection, or
 * undefined for any other error. Says which tile is blocked (the target, or
 * our own launch tile / flag) and, when the client knows it, for how long --
 * a bare "the tile is already in combat" read as if the clicked tile was the
 * problem when it was really the player's own besieged flag.
 */
export const explainCombatLockRejection = (
  state: SiegeState,
  input: { code: string; message: string; targetX?: number | undefined; targetY?: number | undefined; nowMs: number },
  wrap: (x: number, y: number) => { x: number; y: number }
): string | undefined => {
  const { code, message, targetX, targetY, nowMs } = input;
  const ownTileBlocked =
    code === "MUSTER_UNDER_SIEGE" || (code === "LOCKED" && message === COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE);
  if (ownTileBlocked) {
    const siege =
      targetX !== undefined && targetY !== undefined
        ? code === "MUSTER_UNDER_SIEGE"
          ? ownTileSiegeAt(state, targetX, targetY, nowMs)
          : besiegedOwnNeighborOf(state, targetX, targetY, nowMs, wrap)
        : undefined;
    const isMuster =
      code === "MUSTER_UNDER_SIEGE" || message === MUSTER_UNDER_SIEGE_MESSAGE ||
      (siege !== undefined && state.tiles.get(`${siege.x},${siege.y}`)?.muster?.ownerId === state.me);
    const what = isMuster ? "Your muster" : "Your tile next to the target";
    if (!siege) return `${what} is under attack, so its troops can't move until that battle ends.`;
    return `${what} at (${siege.x}, ${siege.y}) is under siege by ${siege.attackerName} — free in ${formatSiegeRemaining(siege.resolvesAt - nowMs)}.`;
  }
  if (code === "LOCKED") return "Another battle is already being fought for this tile. Try again once it ends.";
  return undefined;
};
