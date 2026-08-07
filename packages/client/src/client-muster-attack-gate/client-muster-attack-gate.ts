import { MUSTER_ATTACK_COST, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
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
// that has at least MUSTER_ATTACK_COST staged. No distance cap — any owned
// flag qualifies. A flag on a dock tile that is dock-linked to the target
// (a sea crossing) is scored as a short fixed hop rather than raw grid
// distance, since a dock crossing has no meaningful tile distance.
export const findClosestMuster = (
  state: ClientState,
  targetX: number,
  targetY: number
): { tile: Tile; dist: number } | undefined => {
  let bestTile: Tile | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me) continue;
    if (tile.muster.amount < MUSTER_ATTACK_COST) continue;
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
