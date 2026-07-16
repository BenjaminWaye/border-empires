/**
 * Encirclement — connectivity-based frontier decay.
 *
 * A frontier tile owned by player P is "connected" when there exists a path
 * through other frontier tiles owned by P that terminates at a settled tile
 * owned by P or at a frontier tile that carries a dock. Docks are persistent
 * world-gen features: owning the dock tile gives connectivity even before it
 * is settled. Connectivity uses 8-neighbors (diagonals count). The path may
 * NOT traverse another player's settled tiles.
 *
 * When a frontier tile loses connectivity it is "cut off" and gets a short
 * decay timer (ENCIRCLEMENT_DECAY_MS = 60 s). Reconnection clears the timer.
 * The natural 10-min decay and the encirclement timer share the same
 * `frontierDecayAt` field; `frontierDecayKind` records which mechanic owns
 * the active timer.
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

type ExtraNeighborKeys = (tileKey: string) => Iterable<string>;

const connectedNeighborKeys = (tileKey: string, extraNeighborKeys?: ExtraNeighborKeys): string[] => {
  const [xStr, yStr] = tileKey.split(",");
  const cx = Number(xStr);
  const cy = Number(yStr);
  const keys = NEIGHBOR_OFFSETS.map(({ dx, dy }) => {
    const nx = wrapX(cx + dx, WORLD_WIDTH);
    const ny = wrapY(cy + dy, WORLD_HEIGHT);
    return `${nx},${ny}`;
  });
  if (extraNeighborKeys) {
    for (const extraKey of extraNeighborKeys(tileKey)) keys.push(extraKey);
  }
  return keys;
};

/**
 * Minimal tile shape this module needs from the runtime tile map.
 * Runtime uses DomainTileState; pure functions here only require what they
 * read so they can be called from tests without the full type.
 */
export interface EncirclementTileView {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
  dockId?: string | undefined;
}

const isSupplyTerminal = (tile: EncirclementTileView): boolean =>
  tile.ownershipState === "SETTLED" || (tile.ownershipState === "FRONTIER" && Boolean(tile.dockId));

/**
 * Check whether a single frontier tile owned by `playerId` is connected to
 * any settled tile owned by `playerId` or to any frontier tile that carries
 * a dock, walking only through that player's own frontier tiles. (Settled
 * tiles and frontier dock tiles of the same player are valid path terminators
 * but NOT traversed further; other players' settled tiles block.)
 *
 * Returns true if connected, false if cut off.
 */
export const isFrontierConnected = (
  tileKey: string,
  playerId: string,
  getTile: (key: string) => EncirclementTileView | undefined,
  options?: { extraNeighborKeys?: ExtraNeighborKeys }
): boolean => {
  const tile = getTile(tileKey);
  if (!tile || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") return false;

  if (tile.dockId) return true;

  const visited = new Set<string>();
  const queue: string[] = [tileKey];
  visited.add(tileKey);

  while (queue.length > 0) {
    // biome-ignore lint: queue.shift() is fine here; BFS over bounded territory
    const current = queue.shift()!;
    for (const nk of connectedNeighborKeys(current, options?.extraNeighborKeys)) {
      if (visited.has(nk)) continue;

      const neighbor = getTile(nk);
      if (!neighbor || neighbor.ownerId !== playerId) continue;

      if (isSupplyTerminal(neighbor)) {
        // Reached a friendly settled tile or a frontier dock — connected!
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
 * Lazy cap for the backward BFS in computeEncirclementDeltas (Option C).
 *
 * At 250k owned tiles the backward BFS could visit the entire connected
 * territory component (250k tiles) when the changed key is near the centre.
 * This constant caps the visited-set size. If the backward BFS hits the cap
 * we bail out and return empty sets — i.e., we skip the encirclement check
 * for this tick and retry on the next mutation. This is semantically safe:
 * cut-off tiles stay cut off (their existing timer is preserved), and any
 * reconnection will be detected on the next mutation. The trade-off is
 * eventual consistency rather than same-tick detection in the rare case
 * where a central tile in a 250k+ empire changes ownership in one tick.
 */
export const ENCIRCLEMENT_BFS_CAP = 10_000;

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
 *
 * Option C — lazy partial BFS: if the backward BFS exceeds ENCIRCLEMENT_BFS_CAP
 * visited tiles, the function returns empty sets and logs a warning. The
 * encirclement state of affected tiles is unchanged (timers are preserved).
 * This is safe regression: we just skip detection for this tick.
 */
export const computeEncirclementDeltas = (
  changedKeys: Iterable<string>,
  affectedPlayerId: string,
  getTile: (key: string) => (EncirclementTileView & { frontierDecayAt?: number | undefined }) | undefined,
  nowMs: number,
  options?: {
    bfsCap?: number;
    /**
     * When true, skip cut-off detection — only detect reconnections.
     * Safe for EXPAND: adding a tile can never cut off the attacker's own territory.
     * Callers that pass skipCutOff should also pass a tight bfsCap (e.g. 200) since
     * only nearby tiles can be reconnected by a single expand.
     */
    skipCutOff?: boolean;
    extraNeighborKeys?: ExtraNeighborKeys;
    onCapExceeded?: (playerId: string, visitedCount: number, capLimit: number) => void;
  }
): { cutOff: Set<string>; reconnected: Set<string> } => {
  const bfsCap = options?.bfsCap ?? ENCIRCLEMENT_BFS_CAP;
  const cutOff = new Set<string>();
  const reconnected = new Set<string>();

  // Collect the frontier tiles we need to re-check by doing a BFS over the
  // affected player's frontier territory from the changed tiles. Cap the
  // expansion at ENCIRCLEMENT_BFS_CAP — if exceeded, bail out (Option C).
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

    for (const nk of connectedNeighborKeys(current, options?.extraNeighborKeys)) {
      if (bfsVisited.has(nk)) continue;
      bfsVisited.add(nk);

      const neighbor = getTile(nk);
      if (neighbor?.ownerId === affectedPlayerId) {
        bfsQueue.push(nk);
      }
    }

    // Option C: if the backward BFS grows beyond the cap, bail out and
    // skip this encirclement check. The caller's timers are preserved;
    // detection will happen on the next mutation.
    if (bfsCap > 0 && bfsVisited.size > bfsCap) {
      options?.onCapExceeded?.(affectedPlayerId, bfsVisited.size, bfsCap);
      return { cutOff, reconnected };
    }
  }

  // Single forward BFS from all settled tiles owned by affectedPlayerId that
  // border the affected region. This avoids O(N²) — instead of re-running BFS
  // from every tile in toCheck, we do one pass and mark all reachable frontier
  // tiles as connected.
  //
  // Strategy:
  //   1. Collect settled tiles that are neighbors of any tile in bfsVisited
  //      (the affected region). These are the "roots" of the forward BFS.
  //   2. BFS outward through affectedPlayerId's frontier tiles from those roots.
  //   3. Anything in toCheck reached by the BFS is connected; otherwise cut off.
  const reachable = new Set<string>();
  const fwdQueue: string[] = [];
  const fwdVisited = new Set<string>();

  // Collect supply terminals that border the affected region as BFS roots.
  // Frontier dock tiles in the affected region itself also act as roots —
  // they are their own supply terminal (no settled tile required).
  //
  // Frontier dock roots must also be added to reachable: unlike settled roots,
  // they appear in toCheck (they are FRONTIER tiles), so the classification
  // loop must see them as reachable to avoid a false positive cut-off.
  for (const key of bfsVisited) {
    for (const nk of connectedNeighborKeys(key, options?.extraNeighborKeys)) {
      if (fwdVisited.has(nk)) continue;
      const neighbor = getTile(nk);
      if (neighbor?.ownerId === affectedPlayerId && isSupplyTerminal(neighbor)) {
        fwdVisited.add(nk);
        fwdQueue.push(nk);
        if (neighbor.ownershipState === "FRONTIER") reachable.add(nk);
      }
    }
    // A frontier dock tile in the affected region is its own supply root.
    // Without this, a lone frontier dock tile would be collected in toCheck
    // but never added as a root, causing a false positive cut-off.
    if (fwdVisited.has(key)) continue;
    const tile = getTile(key);
    if (tile?.ownerId === affectedPlayerId && tile.ownershipState === "FRONTIER" && Boolean(tile.dockId)) {
      fwdVisited.add(key);
      fwdQueue.push(key);
      reachable.add(key);
    }
  }

  while (fwdQueue.length > 0) {
    // biome-ignore lint: queue.shift() fine for bounded BFS
    const current = fwdQueue.shift()!;

    for (const nk of connectedNeighborKeys(current, options?.extraNeighborKeys)) {
      if (fwdVisited.has(nk)) continue;
      fwdVisited.add(nk);

      const neighbor = getTile(nk);
      if (neighbor?.ownerId !== affectedPlayerId) continue;

      if (neighbor.ownershipState === "FRONTIER") {
        reachable.add(nk);
        fwdQueue.push(nk);
      } else if (neighbor.ownershipState === "SETTLED") {
        fwdQueue.push(nk);
      }
    }
  }

  // Classify tiles in toCheck using the reachable set.
  for (const key of toCheck) {
    const tile = getTile(key);
    if (!tile || tile.ownerId !== affectedPlayerId || tile.ownershipState !== "FRONTIER") continue;

    if (!reachable.has(key)) {
      if (!options?.skipCutOff) cutOff.add(key);
    } else if (
      typeof tile.frontierDecayAt === "number" &&
      tile.frontierDecayKind === "ENCIRCLEMENT"
    ) {
      // Was cut off by encirclement and is now reconnected. Natural decay
      // timers are not ours to clear, even in their final 60 seconds.
      reconnected.add(key);
    }
  }

  return { cutOff, reconnected };
};
