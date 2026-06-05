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

type PlannerRelevantTileKeyIndexOptions = {
  onPlayerRelevanceRebuild?: (playerId: string, inputTileKeyCount: number) => void;
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
  /**
   * Updates relevance for the given players, rebuilding O(territory×25) key
   * sets only when topologyVersion changed.
   *
   * Returns the set of keys that are newly relevant (in nextKeys but not
   * previousKeys for rebuilt players). The caller uses this to scope the
   * unseen-tile backfill scan — far cheaper than scanning all relevantKeys.
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
  const keysByPlayerId = new Map<string, Set<string>>();
  // Per-player topologyVersion → relevance rebuild gate.
  // buildPlannerRelevantTileKeysForPlayer only depends on territoryTileKeys,
  // frontierTileKeys, and pendingSettlementTileKeys — all of which only change
  // when tile *ownership* changes (EXPAND, ATTACK, tile loss).
  // topologyVersion is bumped ONLY on those transitions; building placements,
  // tech updates, and ownershipState changes (FRONTIER→SETTLED) do NOT bump it.
  // Pre-cache-gate, the rebuild cost was ~322ms p99 on staging for 5 AI players.
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
  ): ReadonlySet<string> => {
    const newlyRelevant = new Set<string>();
    for (const player of players) {
      // topologyVersion only bumps on tile ownership changes (EXPAND/ATTACK/loss).
      // Building placements, tech updates, and FRONTIER→SETTLED transitions do
      // NOT bump it, so we skip the O(territory×25) rebuild for those cases.
      const nextVersion = player.topologyVersion;
      const cachedVersion = versionByPlayerId.get(player.id);
      if (cachedVersion !== undefined && cachedVersion === nextVersion) {
        // Cache hit: topology hasn't changed since the last rebuild. Relevance
        // set and ref-counts remain correct. Skip rebuild.
        continue;
      }
      options.onPlayerRelevanceRebuild?.(
        player.id,
        player.territoryTileKeys.length + player.frontierTileKeys.length + player.pendingSettlementTileKeys.length
      );
      const nextKeys = buildPlannerRelevantTileKeysForPlayer(player, nextTilesByKey, dockLinksByDockTileKey, safeRadius);
      const previousKeys = keysByPlayerId.get(player.id);
      if (previousKeys) removeKeys(previousKeys);
      addKeys(nextKeys);
      keysByPlayerId.set(player.id, nextKeys);
      versionByPlayerId.set(player.id, nextVersion);
      // Collect keys that are new to THIS player's scope — the caller uses
      // these for the unseen-tile backfill scan instead of scanning all
      // relevantKeys (which is O(global_100k) vs O(newly_relevant)).
      for (const key of nextKeys) {
        if (!previousKeys || !previousKeys.has(key)) newlyRelevant.add(key);
      }
    }
    return newlyRelevant;
  };

  replacePlayers(worldView.players, tilesByKey);

  return {
    keys: () => relevantKeys,
    replacePlayers
  };
};
