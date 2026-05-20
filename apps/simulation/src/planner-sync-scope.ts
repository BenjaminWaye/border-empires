import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { frontierNeighborKeys } from "./frontier-topology.js";
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
      for (const neighborKey of frontierNeighborKeys(coords.x, coords.y)) {
        scopedKeys.add(neighborKey);
      }
    }
  }
  return scopedKeys;
};

type PlannerRelevantTileKeyIndex = {
  keys(): ReadonlySet<string>;
  replacePlayers(players: Iterable<PlannerPlayerView>, tilesByKey: ReadonlyMap<string, PlannerTileView>): void;
};

export const createPlannerRelevantTileKeyIndex = (
  worldView: Pick<PlannerWorldView, "players" | "tiles" | "docks">,
  radius = DEFAULT_PLANNER_SYNC_RADIUS
): PlannerRelevantTileKeyIndex => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const tilesByKey = new Map<string, PlannerTileView>(
    worldView.tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const)
  );
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(worldView.docks ?? []);
  const relevantKeys = new Set<string>();
  const keyRefCount = new Map<string, number>();
  const keysByPlayerId = new Map<string, Set<string>>();
  // Per-player tileCollectionVersion → relevance cache key. When the runtime
  // hasn't touched a player's tile composition since the last sync, the
  // relevance set can't have changed: we skip the O(empire) rebuild.
  // markPlannerPlayerTileCollectionDirty bumps the version on any of:
  //   - tile ownership add/remove
  //   - tile state change for an owned tile (covers dockId on owned tiles)
  //   - pending settlement add/remove
  // which is the complete dependency set for buildPlannerRelevantTileKeysForPlayer.
  // Pre-cache, this rebuilt 117k Set inserts per player per sync at 13k
  // owned tiles — ~7s of main-thread block in prod-scale empires.
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

  const replacePlayers = (
    players: Iterable<PlannerPlayerView>,
    nextTilesByKey: ReadonlyMap<string, PlannerTileView>
  ): void => {
    for (const player of players) {
      const nextVersion = player.tileCollectionVersion;
      const cachedVersion = versionByPlayerId.get(player.id);
      if (cachedVersion !== undefined && cachedVersion === nextVersion) {
        // Cache hit: the runtime hasn't bumped this player's version since
        // the last replacePlayers call. The previous relevance set is still
        // accurate (its ref-counts in relevantKeys / keyRefCount also remain
        // correct). Skip the rebuild entirely.
        continue;
      }
      const nextKeys = buildPlannerRelevantTileKeysForPlayer(player, nextTilesByKey, dockLinksByDockTileKey, safeRadius);
      const previousKeys = keysByPlayerId.get(player.id);
      if (previousKeys) removeKeys(previousKeys);
      addKeys(nextKeys);
      keysByPlayerId.set(player.id, nextKeys);
      versionByPlayerId.set(player.id, nextVersion);
    }
  };

  replacePlayers(worldView.players, tilesByKey);

  return {
    keys: () => relevantKeys,
    replacePlayers
  };
};
