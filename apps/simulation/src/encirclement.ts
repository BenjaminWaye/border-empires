/**
 * Encirclement — connectivity-based frontier decay.
 *
 * A frontier tile owned by player P is "connected" when there exists a path
 * through other frontier tiles owned by P that terminates at a settled tile
 * owned by P. Connectivity uses 8-neighbors (diagonals count). The path may
 * NOT traverse another player's settled tiles.
 *
 * When a frontier tile loses connectivity it is "cut off" and gets a short
 * decay timer (ENCIRCLEMENT_DECAY_MS = 60 s). Reconnection clears the timer.
 * The natural 10-min decay and the encirclement timer share the same
 * `frontierDecayAt` field; whichever is smaller wins.
 */

import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const ENCIRCLEMENT_DECAY_MS = 60_000;

/** 8-neighbor coordinate offsets. */
const NEIGHBOR_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 },
  { dx:  0, dy: -1 },
  { dx:  1, dy: -1 },
  { dx: -1, dy:  0 },
  { dx:  1, dy:  0 },
  { dx: -1, dy:  1 },
  { dx:  0, dy:  1 },
  { dx:  1, dy:  1 }
];

/**
 * Minimal tile shape this module needs from the runtime tile map.
 * Runtime uses DomainTileState; pure functions here only require what they
 * read so they can be called from tests without the full type.
 */
export interface EncirclementTileView {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
}

/**
 * Check whether a single frontier tile owned by `playerId` is connected to
 * any settled tile owned by `playerId`, walking only through that player's
 * own frontier tiles (settled tiles of the same player are valid path
 * terminators but NOT traversed further; other players' settled tiles block).
 *
 * Returns true if connected, false if cut off.
 */
export const isFrontierConnected = (
  tileKey: string,
  playerId: string,
  getTile: (key: string) => EncirclementTileView | undefined
): boolean => {
  const tile = getTile(tileKey);
  if (!tile || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") return false;

  const visited = new Set<string>();
  const queue: string[] = [tileKey];
  visited.add(tileKey);

  while (queue.length > 0) {
    // biome-ignore lint: queue.shift() is fine here; BFS over bounded territory
    const current = queue.shift()!;
    const [xStr, yStr] = current.split(",");
    const cx = Number(xStr);
    const cy = Number(yStr);

    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const nx = wrapX(cx + dx, WORLD_WIDTH);
      const ny = wrapY(cy + dy, WORLD_HEIGHT);
      const nk = `${nx},${ny}`;
      if (visited.has(nk)) continue;

      const neighbor = getTile(nk);
      if (!neighbor || neighbor.ownerId !== playerId) continue;

      if (neighbor.ownershipState === "SETTLED") {
        // Reached a friendly settled tile — connected!
        return true;
      }

      if (neighbor.ownershipState === "FRONTIER") {
        visited.add(nk);
        queue.push(nk);
      }
      // Any other state (BARBARIAN, or another player's tile) — skip.
    }
  }

  return false;
};

/**
 * Given a set of tile keys that may have been affected by a recent ownership
 * change, compute two sets:
 *   - `cutOff`       — keys that are now disconnected
 *   - `reconnected`  — keys that had `frontierDecayAt` set (were cut off)
 *                      but are now connected again
 *
 * Only considers frontier tiles owned by `affectedPlayerId`. If
 * `affectedPlayerId` is undefined (e.g. tile was uncaptured), returns empty.
 *
 * Implementation: BFS from the changed tile key(s) outward to find the
 * affected region; re-checks connectivity only for tiles in that region.
 * This keeps the check local rather than scanning all player territory.
 */
export const computeEncirclementDeltas = (
  changedKeys: Iterable<string>,
  affectedPlayerId: string,
  getTile: (key: string) => (EncirclementTileView & { frontierDecayAt?: number | undefined }) | undefined,
  nowMs: number
): { cutOff: Set<string>; reconnected: Set<string> } => {
  const cutOff = new Set<string>();
  const reconnected = new Set<string>();

  // Collect the frontier tiles we need to re-check by doing a BFS over the
  // affected player's frontier territory from the changed tiles. Cap the
  // expansion at the full connected component — it won't exceed player territory.
  const toCheck = new Set<string>();
  const bfsVisited = new Set<string>();
  const bfsQueue: string[] = [];

  for (const key of changedKeys) {
    bfsQueue.push(key);
    bfsVisited.add(key);
  }

  while (bfsQueue.length > 0) {
    // biome-ignore lint: queue.shift() fine for bounded BFS
    const current = bfsQueue.shift()!;
    const tile = getTile(current);

    if (tile?.ownerId === affectedPlayerId && tile.ownershipState === "FRONTIER") {
      toCheck.add(current);
    }

    const [xStr, yStr] = current.split(",");
    const cx = Number(xStr);
    const cy = Number(yStr);

    for (const { dx, dy } of NEIGHBOR_OFFSETS) {
      const nx = wrapX(cx + dx, WORLD_WIDTH);
      const ny = wrapY(cy + dy, WORLD_HEIGHT);
      const nk = `${nx},${ny}`;
      if (bfsVisited.has(nk)) continue;
      bfsVisited.add(nk);

      const neighbor = getTile(nk);
      if (neighbor?.ownerId === affectedPlayerId) {
        bfsQueue.push(nk);
      }
    }
  }

  // For each frontier tile in the affected region, check connectivity.
  for (const key of toCheck) {
    const tile = getTile(key);
    if (!tile || tile.ownerId !== affectedPlayerId || tile.ownershipState !== "FRONTIER") continue;

    const connected = isFrontierConnected(key, affectedPlayerId, getTile);

    if (!connected) {
      // Only mark cut-off if the tile doesn't already have a shorter timer
      // (shorter = the natural decay is already closing in). We set the timer
      // to min(existing, now + ENCIRCLEMENT_DECAY_MS). But we always add to
      // cutOff so the caller can apply min-wins.
      cutOff.add(key);
    } else if (typeof tile.frontierDecayAt === "number") {
      // Was cut off (has a timer) and is now reconnected.
      reconnected.add(key);
    }
  }

  return { cutOff, reconnected };
};
