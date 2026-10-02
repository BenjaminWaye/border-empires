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
 *
 * A missing or invalid revision is rejected outright rather than defaulted to
 * 0: defaulting used to skip the staleness check entirely (0 is never > 1)
 * and then reset serverReachRevision to 0, silently disabling ordering
 * protection for every update after it too.
 */
export const applyServerReachUpdate = (state: ReachAuthoritativeState, message: ReachUpdateMessage): boolean => {
  if (!Array.isArray(message.tileKeys)) return false;
  if (typeof message.revision !== "number" || !Number.isFinite(message.revision) || message.revision < 1) return false;
  const revision = message.revision;
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
 * `resolveMyReachCached` reads and writes these on top of the authoritative
 * fields. Kept as a superset type (rather than widening ReachAuthoritativeState)
 * so the many `Pick<ClientState, ...>` callers of `authoritativeIsInReach` and
 * the apply/clear mutators keep their narrow parameter types.
 */
export type ReachCacheState = ReachAuthoritativeState & {
  tilesRevision: number;
  myReach: Set<string> | undefined;
  myReachRevisionAtCompute: string;
};

// Identity of the server reach Set, as a small integer. `serverReachRevision`
// alone is not a unique cache key: clearServerReach resets it to 0 and the
// next session's first REACH_UPDATE restarts at 1, so with an unchanged
// tilesRevision a stale "N:1" entry from the previous session would match.
// applyServerReachUpdate always builds a fresh Set, so keying on the Set's
// identity makes every applied update (any revision) a cache miss without the
// mutators having to know about the cache.
const reachSetIds = new WeakMap<Set<string>, number>();
let nextReachSetId = 1;
const reachSetId = (reach: Set<string> | undefined): number => {
  if (!reach) return 0;
  let id = reachSetIds.get(reach);
  if (id === undefined) {
    id = nextReachSetId;
    nextReachSetId += 1;
    reachSetIds.set(reach, id);
  }
  return id;
};

/**
 * Cache key for "what is my reach right now": changes whenever the tiles the
 * local approximation scans change, or the server's reach set is replaced or
 * cleared. Shared by the 2D loop, the 3D rebuild and `resolveMyReachCached`.
 */
export const reachCacheKey = (state: Pick<ReachCacheState, "tilesRevision" | "serverReach" | "serverReachRevision">): string =>
  `${state.tilesRevision}:${state.serverReachRevision}:${reachSetId(state.serverReach)}`;

/**
 * `resolveMyReach`, memoised on `state.myReach` / `state.myReachRevisionAtCompute`.
 * Use this anywhere that can run per frame: without a server REACH_UPDATE
 * `resolveMyReach` is a full tile scan plus a flood fill from every anchor.
 * The returned set is shared; callers must not mutate it.
 */
export const resolveMyReachCached = (state: ReachCacheState): Set<string> => {
  const key = reachCacheKey(state);
  if (state.myReach && state.myReachRevisionAtCompute === key) return state.myReach;
  const reach = resolveMyReach(state);
  state.myReach = reach;
  state.myReachRevisionAtCompute = key;
  return reach;
};

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
