import { requiredMusterForTarget, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { MUSTER_FLAG_REQUEST_TIMEOUT_MS } from "../client-constants.js";
import { chebyshevDistanceClient } from "../client-tile-action-support/client-tile-action-support.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Sea crossings between a player's dock and a dock-linked target have no
// meaningful grid distance (the two docks can be anywhere on the map), so a
// ready muster flag staged on a dock tile that is dock-linked to the target
// is scored as a short fixed hop instead of raw Chebyshev distance. Without
// this, the MUSTER_AUTO_FLAG_THRESHOLD_TILES range check in processActionQueue
// never passes for a dock-connected target, and a fully mustered attack
// across a dock link never fires (it just re-parks forever).
const DOCK_CROSSING_MUSTER_TRANSIT_TILES = 1;

// Mirrors resolveMusterSource's hardcoded search radius in
// apps/simulation/src/runtime-muster-source.ts — the server already funds an
// ATTACK from any owned flag within this distance of the firing tile,
// regardless of which flag is physically adjacent to the target (ADVANCE
// already relies on exactly this: it fires from whichever connected owned
// tile borders the enemy, funded remotely by the flag). Keep in sync with
// that file if its radius ever changes — there's no shared constant for it.
const MUSTER_REMOTE_FUNDING_RADIUS_TILES = 10;

const isAdjacentWrapped = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

// True when (originX, originY) is a dock tile whose paired/connected sea
// route lands on (targetX, targetY) or adjacent to it. Mirrors
// client-origin-selection's dockDestinationsFor/isDockLinkedToTarget.
export const isDockCrossingBetween = (
  state: Pick<ClientState, "dockPairs">,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number
): boolean => {
  for (const pair of state.dockPairs) {
    const linked =
      pair.ax === originX && pair.ay === originY
        ? { x: pair.bx, y: pair.by }
        : pair.bx === originX && pair.by === originY
          ? { x: pair.ax, y: pair.ay }
          : undefined;
    if (!linked) continue;
    if (linked.x === targetX && linked.y === targetY) return true;
    if (isAdjacentWrapped(linked.x, linked.y, targetX, targetY)) return true;
  }
  return false;
};

// Find the muster tile owned by the player closest to (targetX, targetY)
// that has at least requiredMusterForTarget(target) staged — the real
// per-target requirement (garrisoned forts need more than the flat base
// cost), not just the flat base cost itself. No distance cap — any owned
// flag qualifies. A flag on a dock tile that is dock-linked to the target
// (a sea crossing) is scored as a short fixed hop rather than raw grid
// distance, since a dock crossing has no meaningful tile distance.
export const findClosestMuster = (
  state: ClientState,
  targetX: number,
  targetY: number
): { tile: Tile; dist: number } | undefined => {
  const target = state.tiles.get(`${targetX},${targetY}`);
  const required = requiredMusterForTarget(target);
  let bestTile: Tile | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me) continue;
    if (tile.muster.amount < required) continue;
    // A flag already funding another in-flight (marching or just-fired)
    // attack can't be double-booked for a second target at the same time —
    // skip it so a different flag (or none) is chosen instead.
    if (state.musterTransitByTile.has(`${tile.x},${tile.y}`)) continue;
    const rawDist = chebyshevDistanceClient(tile.x, tile.y, targetX, targetY);
    const dist = isDockCrossingBetween(state, tile.x, tile.y, targetX, targetY)
      ? Math.min(rawDist, DOCK_CROSSING_MUSTER_TRANSIT_TILES)
      : rawDist;
    if (dist < bestDist) {
      bestDist = dist;
      bestTile = tile;
    }
  }
  return bestTile ? { tile: bestTile, dist: bestDist } : undefined;
};

// Owned muster flag that could actually fund an attack on (targetX, targetY)
// launched from (originX, originY) once it fills up, regardless of whether
// it has enough manpower staged yet. Used only as a MUSTER_LIMIT fallback
// (processPendingMusterAttacks via dropStuckPendingMusterAttack): when the
// server refuses to create a brand-new flag because the player is already at
// their cap, this looks for an existing flag the pending attack can reroute
// onto instead of being dropped. A candidate qualifies either by sitting
// adjacent/dock-linked to the target itself, or — mirroring the server's own
// resolveMusterSource (apps/simulation/src/runtime-muster-source.ts) and the
// same remote-funding radius ADVANCE auto-fire and a normal manual attack
// both already rely on — by sitting within MUSTER_REMOTE_FUNDING_RADIUS_TILES
// of the firing tile (originX, originY), since the server funds an ATTACK
// from any owned flag that close without requiring the flag itself to border
// the enemy. A flag satisfying neither would just re-park forever until the
// 5-minute hard timeout, instead of actually being usable. Excludes a flag
// already reserved for another attack's transit, same as findClosestMuster.
export const findClosestOwnedMusterTile = (
  state: Pick<ClientState, "tiles" | "me" | "musterTransitByTile" | "dockPairs">,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number
): { tile: Tile; dist: number } | undefined => {
  let bestTile: Tile | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me) continue;
    if (state.musterTransitByTile.has(`${tile.x},${tile.y}`)) continue;
    const touchesTarget = isAdjacentWrapped(tile.x, tile.y, targetX, targetY) || isDockCrossingBetween(state, tile.x, tile.y, targetX, targetY);
    const fundsOrigin = chebyshevDistanceClient(tile.x, tile.y, originX, originY) <= MUSTER_REMOTE_FUNDING_RADIUS_TILES;
    if (!touchesTarget && !fundsOrigin) continue;
    const dist = chebyshevDistanceClient(tile.x, tile.y, targetX, targetY);
    if (dist < bestDist) {
      bestDist = dist;
      bestTile = tile;
    }
  }
  return bestTile ? { tile: bestTile, dist: bestDist } : undefined;
};

// Find some owned, unreserved flag with enough manpower within the server's
// remote-funding radius of (originX, originY) — the tile an attack would
// actually fire from. When found, the client doesn't need the firing tile to
// itself host a flag: sending ATTACK from originX/originY is enough, and the
// server auto-funds it from that nearby flag (same as ADVANCE). This is what
// lets a manual attack use a flag that's close but not literally adjacent to
// the target, instead of parking behind (and potentially auto-creating) a
// brand new flag it doesn't need. Returns the nearest such flag (and its
// distance from originX/originY) rather than just a boolean so callers can
// arm a real transit/march against it instead of firing instantly.
export const findFundedMusterWithinRange = (
  state: Pick<ClientState, "tiles" | "me" | "musterTransitByTile">,
  originX: number,
  originY: number,
  required: number
): { tile: Tile; dist: number } | undefined => {
  let bestTile: Tile | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me) continue;
    if (tile.muster.amount < required) continue;
    if (state.musterTransitByTile.has(`${tile.x},${tile.y}`)) continue;
    const dist = chebyshevDistanceClient(tile.x, tile.y, originX, originY);
    if (dist <= MUSTER_REMOTE_FUNDING_RADIUS_TILES && dist < bestDist) {
      bestDist = dist;
      bestTile = tile;
    }
  }
  return bestTile ? { tile: bestTile, dist: bestDist } : undefined;
};

// True when some owned, unreserved flag has enough manpower and sits within
// the server's remote-funding radius of (originX, originY). Thin boolean
// wrapper over findFundedMusterWithinRange for callers that only need the
// yes/no gate, not the flag itself.
export const hasFundedMusterWithinRange = (
  state: Pick<ClientState, "tiles" | "me" | "musterTransitByTile">,
  originX: number,
  originY: number,
  required: number
): boolean => findFundedMusterWithinRange(state, originX, originY, required) !== undefined;

// True when a parked attack's origin (fromX, fromY) still borders the target
// (or dock-links to it) and some owned ready flag funds it remotely, per the
// server's own resolveMusterSource (apps/simulation/src/runtime-muster-
// source.ts) — it doesn't require the funding flag to itself touch the
// target, same as ADVANCE auto-fire already relies on. Used by
// processPendingMusterAttacks (client-queue-logic.ts) as an alternative to
// closestIsAdjacentOrLinked when deciding whether a parked attack can
// promote. The origin-adjacency re-check guards against ownership having
// shifted since fromX/fromY was first picked.
export const isPendingAttackFundedFromOrigin = (
  state: Pick<ClientState, "tiles" | "me" | "musterTransitByTile" | "dockPairs">,
  entry: { fromX: number; fromY: number; targetX: number; targetY: number },
  required: number,
  isAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean
): boolean =>
  (isAdjacent(entry.fromX, entry.fromY, entry.targetX, entry.targetY) ||
    isDockCrossingBetween(state, entry.fromX, entry.fromY, entry.targetX, entry.targetY)) &&
  hasFundedMusterWithinRange(state, entry.fromX, entry.fromY, required);

// SET_MUSTER (sent by processActionQueue when auto-creating a flag for a
// parked attack) is fire-and-forget — no ack, no optimistic local state. If
// the server rejects it (e.g. MUSTER_LIMIT: "max 3 muster tiles per player")
// nothing tells the pending entry, and it would otherwise sit forever
// waiting on a flag that will never exist — the "Mustering 0/N" overlay that
// never fills. processActionQueue stamps musterRequestedAt only when it just
// asked for a brand new flag; once that flag still hasn't shown up long
// after the request, the create was almost certainly rejected (most commonly
// MUSTER_LIMIT). Rather than give up outright, first try rerouting the entry
// onto the player's closest *existing* flag (findClosestOwnedMusterTile) —
// same "wait for it to fill/march" handling this entry already gets, just
// against a flag that's actually going to exist. Only drop the entry, with
// pushFeed telling the player, when no existing flag can be found either.
export const dropStuckPendingMusterAttack = (
  state: Pick<ClientState, "tiles" | "me" | "musterTransitByTile" | "dockPairs">,
  entry: { targetX: number; targetY: number; fromX: number; fromY: number; musterTileKey: string; musterRequestedAt?: number },
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    keyFor: (x: number, y: number) => string;
    sendGameMessage: ((payload: unknown) => boolean) | undefined;
  }
): boolean => {
  if (entry.musterRequestedAt == null) return false;
  if (state.tiles.get(entry.musterTileKey)?.muster?.ownerId === state.me) return false;
  if (Date.now() - entry.musterRequestedAt <= MUSTER_FLAG_REQUEST_TIMEOUT_MS) return false;
  const fallback = findClosestOwnedMusterTile(state, entry.fromX, entry.fromY, entry.targetX, entry.targetY);
  if (fallback) {
    entry.musterTileKey = deps.keyFor(fallback.tile.x, fallback.tile.y);
    delete entry.musterRequestedAt;
    deps.sendGameMessage?.({ type: "WATCH_MUSTER", x: fallback.tile.x, y: fallback.tile.y });
    deps.pushFeed(
      `Muster flags full — attack on (${entry.targetX}, ${entry.targetY}) will use the flag at (${fallback.tile.x}, ${fallback.tile.y}) instead`,
      "combat",
      "warn"
    );
    return false;
  }
  deps.pushFeed(
    `Couldn't stage a flag near (${entry.targetX}, ${entry.targetY}) — attack cancelled. Check your muster flags (max 3).`,
    "combat",
    "error"
  );
  return true;
};
