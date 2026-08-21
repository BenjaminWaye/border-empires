import { computeLocalReachSet, type ReachOverlayTileMap } from "../client-reach-overlay/client-reach-overlay.js";

/**
 * Server-authoritative reach on the client.
 *
 * `client-reach-overlay.ts`'s `computeLocalReachSet` derives reach from the
 * tiles this client happens to have cached. It is a documented approximation:
 * it cannot see contested-tile clipping against other players' anchors, so it
 * can claim a tile the simulation would reject as OUT_OF_REACH. That mismatch
 * is not cosmetic — the waypoint planner used the same approximation to pick
 * EXPAND steps, so it would emit a step the server refused, forever.
 *
 * The simulation now pushes the real border as REACH_UPDATE
 * (apps/simulation/src/runtime-reach-update/runtime-reach-update.ts). This
 * module owns applying those messages and is the single place anything on the
 * client should ask "what is my reach": `resolveMyReach` prefers the server's
 * answer and only falls back to the local approximation before the first
 * message has arrived (initial paint, or an old server that never sends one).
 */

/** The subset of ClientState this module reads and writes. */
export type ReachAuthoritativeState = {
  tiles: ReachOverlayTileMap;
  me: string;
  serverReach: Set<string> | undefined;
  serverReachRevision: number;
};

/** Shape of a REACH_UPDATE payload, before validation. */
export type ReachUpdateMessage = {
  tileKeys?: unknown;
  revision?: unknown;
};

/**
 * Applies one REACH_UPDATE. Returns true when state changed, so callers can
 * invalidate the cached overlay set and re-render.
 *
 * Stale arrivals are dropped by revision: the transport can reorder, and
 * applying an older border over a newer one would resurrect exactly the
 * client/server disagreement this whole mechanism exists to remove. A
 * revision at or below the current one is ignored — except revision 1, which
 * is how a reconnect announces a fresh per-player sequence (the simulation
 * restarts revisions from 1 on its own restart, and the client's counter
 * survives a socket reconnect that the simulation never saw).
 */
export const applyServerReachUpdate = (state: ReachAuthoritativeState, message: ReachUpdateMessage): boolean => {
  if (!Array.isArray(message.tileKeys)) return false;
  const revision = typeof message.revision === "number" && Number.isFinite(message.revision) ? message.revision : 0;
  if (revision > 1 && revision <= state.serverReachRevision) return false;
  const tileKeys = message.tileKeys.filter((key): key is string => typeof key === "string");
  state.serverReach = new Set(tileKeys);
  state.serverReachRevision = revision;
  return true;
};

/**
 * The reach set to use for rendering and for planning. Server data when we
 * have it; the local approximation only until then.
 */
export const resolveMyReach = (state: ReachAuthoritativeState): Set<string> =>
  state.serverReach ?? computeLocalReachSet(state.tiles, state.me);

/**
 * `isInReach` predicate for the waypoint planner's deps. Resolves the set once
 * and closes over it — the search calls the predicate once per candidate
 * EXPAND step, so re-resolving per call would be far too slow.
 */
export const authoritativeIsInReach = (
  state: ReachAuthoritativeState,
  keyFor: (x: number, y: number) => string
): ((x: number, y: number) => boolean) => {
  const reach = resolveMyReach(state);
  return (x: number, y: number): boolean => reach.has(keyFor(x, y));
};

/**
 * Drops the server's reach — call on disconnect/season rollover so a stale
 * border from a previous session cannot outlive the connection that produced
 * it. Reverts to the local approximation until the next REACH_UPDATE lands.
 */
export const clearServerReach = (state: ReachAuthoritativeState): void => {
  state.serverReach = undefined;
  state.serverReachRevision = 0;
};
