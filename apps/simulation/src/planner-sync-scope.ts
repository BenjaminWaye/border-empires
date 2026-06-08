import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { forEachFrontierNeighbor } from "./frontier-topology.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const DEFAULT_PLANNER_SYNC_RADIUS = 2;

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const addScopedKey = (target: Set<string>, tileKey: string, radius: number): void => {
  target.add(tileKey);
  const coords = parseTileKey(tileKey);
  if (!coords) return;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      target.add(`${wrapX(coords.x + dx, WORLD_WIDTH)},${wrapY(coords.y + dy, WORLD_HEIGHT)}`);
    }
  }
};

type PlannerRelevantTileKeyIndexOptions = {
  onPlayerRelevanceRebuild?: (playerId: string, inputTileKeyCount: number) => void;
  /** Fires on each incremental delta application (not full rebuild). */
  onPlayerIncrementalDelta?: (playerId: string, dirtyTileCount: number) => void;
};

export const buildPlannerRelevantTileKeys = (
  worldView: Pick<PlannerWorldView, "players" | "tiles" | "docks">,
  radius = DEFAULT_PLANNER_SYNC_RADIUS
): Set<string> => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const scopedKeys = new Set<string>();
  const tilesByKey = new Map<string, (typeof worldView.tiles)[number]>(
    worldView.tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const)
  );
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(worldView.docks ?? []);
  for (const player of worldView.players) {
    for (const tileKey of buildPlannerRelevantTileKeysForPlayer(player, tilesByKey, dockLinksByDockTileKey, safeRadius)) {
      scopedKeys.add(tileKey);
    }
  }
  return scopedKeys;
};

export const buildPlannerRelevantTileKeysForPlayer = (
  player: Pick<PlannerPlayerView, "territoryTileKeys" | "frontierTileKeys" | "pendingSettlementTileKeys">,
  tilesByKey: ReadonlyMap<string, PlannerTileView>,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  radius = DEFAULT_PLANNER_SYNC_RADIUS
): Set<string> => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const scopedKeys = new Set<string>();
  for (const tileKey of player.territoryTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
  for (const tileKey of player.frontierTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
  for (const tileKey of player.pendingSettlementTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
  for (const tileKey of player.territoryTileKeys) {
    if (!tilesByKey.get(tileKey)?.dockId) continue;
    for (const linkedDockTileKey of dockLinksByDockTileKey.get(tileKey) ?? []) {
      addScopedKey(scopedKeys, linkedDockTileKey, safeRadius);
      const coords = parseTileKey(linkedDockTileKey);
      if (!coords) continue;
      forEachFrontierNeighbor(coords.x, coords.y, (nx, ny) => scopedKeys.add(`${nx},${ny}`));
    }
  }
  return scopedKeys;
};

type PlannerRelevantTileKeyIndex = {
  keys(): ReadonlySet<string>;
  /**
   * Updates relevance for the given players using incremental delta when
   * possible, falling back to a full O(territory×25) rebuild only on first
   * sync or when a dock tile changed ownership.
   *
   * Returns the set of keys that are newly relevant (keys the worker hasn't
   * seen yet). The caller uses this for the unseen-tile backfill scan instead
   * of scanning all relevantKeys.
   */
  replacePlayers(players: Iterable<PlannerPlayerView>, tilesByKey: ReadonlyMap<string, PlannerTileView>): ReadonlySet<string>;
};

export const createPlannerRelevantTileKeyIndex = (
  worldView: Pick<PlannerWorldView, "players" | "tiles" | "docks">,
  radius = DEFAULT_PLANNER_SYNC_RADIUS,
  options: PlannerRelevantTileKeyIndexOptions = {}
): PlannerRelevantTileKeyIndex => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const tilesByKey = new Map<string, PlannerTileView>(
    worldView.tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const)
  );
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(worldView.docks ?? []);
  const relevantKeys = new Set<string>();
  const keyRefCount = new Map<string, number>();
  // Per-player set of all tile keys currently in scope.
  const keysByPlayerId = new Map<string, Set<string>>();
  // Per-player cached territory set used by the incremental delta path.
  // Absence means the player hasn't been synced yet → full rebuild required.
  const playerTerritoryByPlayerId = new Map<string, Set<string>>();
  const versionByPlayerId = new Map<string, number>();

  const addKeys = (keys: ReadonlySet<string>): void => {
    for (const key of keys) {
      const nextCount = (keyRefCount.get(key) ?? 0) + 1;
      keyRefCount.set(key, nextCount);
      relevantKeys.add(key);
    }
  };

  const removeKeys = (keys: ReadonlySet<string>): void => {
    for (const key of keys) {
      const nextCount = (keyRefCount.get(key) ?? 0) - 1;
      if (nextCount <= 0) {
        keyRefCount.delete(key);
        relevantKeys.delete(key);
      } else {
        keyRefCount.set(key, nextCount);
      }
    }
  };

  const fullRebuildForPlayer = (
    player: PlannerPlayerView,
    nextTilesByKey: ReadonlyMap<string, PlannerTileView>,
    newlyRelevant: Set<string>
  ): void => {
    options.onPlayerRelevanceRebuild?.(
      player.id,
      player.territoryTileKeys.length + player.frontierTileKeys.length + player.pendingSettlementTileKeys.length
    );
    const nextKeys = buildPlannerRelevantTileKeysForPlayer(player, nextTilesByKey, dockLinksByDockTileKey, safeRadius);
    const previousKeys = keysByPlayerId.get(player.id);
    if (previousKeys) removeKeys(previousKeys);
    addKeys(nextKeys);
    keysByPlayerId.set(player.id, nextKeys);
    for (const key of nextKeys) {
      if (!previousKeys || !previousKeys.has(key)) newlyRelevant.add(key);
    }
  };

  const replacePlayers = (
    players: Iterable<PlannerPlayerView>,
    nextTilesByKey: ReadonlyMap<string, PlannerTileView>
  ): ReadonlySet<string> => {
    const newlyRelevant = new Set<string>();
    for (const player of players) {
      const nextVersion = player.topologyVersion;
      const cachedVersion = versionByPlayerId.get(player.id);
      const dirtyTileKeys = player.topologyDirtyTileKeys ?? [];
      const previousTerritory = playerTerritoryByPlayerId.get(player.id);

      // No-op: nothing changed since last sync.
      if (cachedVersion !== undefined && cachedVersion === nextVersion && dirtyTileKeys.length === 0) {
        continue;
      }

      const currentTerritory = new Set(player.territoryTileKeys);

      // Fall back to full rebuild when:
      //   - first sync for this player (no previousTerritory cached), OR
      //   - a dock tile changed ownership (dock linked-neighbor logic is complex
      //     and dock flips are rare, so full rebuild is correct and acceptable).
      const hasDockTile = dirtyTileKeys.some((k) => !!nextTilesByKey.get(k)?.dockId);
      if (!previousTerritory || hasDockTile) {
        fullRebuildForPlayer(player, nextTilesByKey, newlyRelevant);
        versionByPlayerId.set(player.id, nextVersion);
        playerTerritoryByPlayerId.set(player.id, currentTerritory);
        continue;
      }

      // Incremental path: apply each dirty tile as an add or remove.
      // Cost: O(delta × radius²) ≪ O(territory × radius²) full rebuild.
      //
      // Uses currentTerritory (the final state) consistently for all coverage
      // checks, so add-then-remove and remove-then-add oscillations collapse
      // naturally to no-ops via the currentlyOwned === previouslyOwned guard.
      const playerKeys = keysByPlayerId.get(player.id) ?? (() => {
        const s = new Set<string>();
        keysByPlayerId.set(player.id, s);
        return s;
      })();

      for (const dirtyTile of dirtyTileKeys) {
        const currentlyOwned = currentTerritory.has(dirtyTile);
        const previouslyOwned = previousTerritory.has(dirtyTile);
        if (currentlyOwned === previouslyOwned) continue; // oscillated → no-op

        if (currentlyOwned) {
          // ADD: include this tile's radius neighborhood.
          const tileNeighborhood = new Set<string>();
          addScopedKey(tileNeighborhood, dirtyTile, safeRadius);
          for (const K of tileNeighborhood) {
            if (!playerKeys.has(K)) {
              playerKeys.add(K);
              const nextCount = (keyRefCount.get(K) ?? 0) + 1;
              keyRefCount.set(K, nextCount);
              relevantKeys.add(K);
              newlyRelevant.add(K);
            }
          }
        } else {
          // REMOVE: drop neighborhood keys no longer covered by any remaining
          // territory tile. Coverage check: is any tile within safeRadius of key K
          // still in currentTerritory (which excludes dirtyTile)?
          const tileNeighborhood = new Set<string>();
          addScopedKey(tileNeighborhood, dirtyTile, safeRadius);
          for (const K of tileNeighborhood) {
            if (!playerKeys.has(K)) continue;
            const kCoords = parseTileKey(K);
            if (!kCoords) continue;
            let stillCovered = false;
            outer: for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
              for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
                const candidate = `${wrapX(kCoords.x + dx, WORLD_WIDTH)},${wrapY(kCoords.y + dy, WORLD_HEIGHT)}`;
                if (candidate !== dirtyTile && currentTerritory.has(candidate)) {
                  stillCovered = true;
                  break outer;
                }
              }
            }
            if (!stillCovered) {
              playerKeys.delete(K);
              const nextCount = (keyRefCount.get(K) ?? 0) - 1;
              if (nextCount <= 0) {
                keyRefCount.delete(K);
                relevantKeys.delete(K);
              } else {
                keyRefCount.set(K, nextCount);
              }
            }
          }
        }
      }

      options.onPlayerIncrementalDelta?.(player.id, dirtyTileKeys.length);
      versionByPlayerId.set(player.id, nextVersion);
      playerTerritoryByPlayerId.set(player.id, currentTerritory);
    }
    return newlyRelevant;
  };

  replacePlayers(worldView.players, tilesByKey);

  return {
    keys: () => relevantKeys,
    replacePlayers
  };
};
