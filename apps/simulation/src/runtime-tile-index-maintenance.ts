import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "./runtime-types.js";
import type { PlayerCandidateIndex } from "./player-candidate-index/player-candidate-index.js";
import {
  candidateIndexKeysAroundTileKey,
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile,
  playerIdsAffectedByTileChange
} from "./ai/planner-candidate-index.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import type { ConnectedTownNetworkEntry } from "./economy-network/economy-network.js";
import {
  addTileUpkeepToCache,
  removeTileUpkeepFromCache,
  type UpkeepAccrualSnapshot
} from "./player-upkeep-incremental/player-upkeep-incremental.js";
import {
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "./territory-automation/territory-automation.js";

export const isYieldBearingTile = (tile: DomainTileState): boolean => {
  if (!tile.ownerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
  if (tile.town) return true;
  if (tile.dockId) return true;
  if (tile.resource !== undefined && tile.resource !== null) {
    switch (tile.resource) {
      case "FARM":
      case "FISH":
      case "IRON":
      case "WOOD":
      case "FUR":
      case "GEMS":
        return true;
      default:
        break;
    }
  }
  if (tile.economicStructure?.status === "active") {
    switch (tile.economicStructure.type) {
      case "FUR_SYNTHESIZER":
      case "ADVANCED_FUR_SYNTHESIZER":
      case "IRONWORKS":
      case "ADVANCED_IRONWORKS":
      case "CRYSTAL_SYNTHESIZER":
      case "ADVANCED_CRYSTAL_SYNTHESIZER":
        return true;
      default:
        break;
    }
  }
  return false;
};

export const addFrontierTileToOwnerIndex = (
  frontierTilesByOwner: Map<string, Set<string>>,
  tileKey: string,
  ownerId: string
): void => {
  let set = frontierTilesByOwner.get(ownerId);
  if (!set) {
    set = new Set<string>();
    frontierTilesByOwner.set(ownerId, set);
  }
  set.add(tileKey);
};

export const removeFrontierTileFromOwnerIndex = (
  frontierTilesByOwner: Map<string, Set<string>>,
  tileKey: string,
  ownerId: string
): void => {
  frontierTilesByOwner.get(ownerId)?.delete(tileKey);
};

export const addYieldBearingTileToOwnerIndex = (
  yieldBearingTilesByOwner: Map<string, Set<string>>,
  sortedYieldBearingKeysByOwner: Map<string, string[]>,
  tileKey: string,
  ownerId: string
): void => {
  let set = yieldBearingTilesByOwner.get(ownerId);
  if (!set) {
    set = new Set<string>();
    yieldBearingTilesByOwner.set(ownerId, set);
  }
  set.add(tileKey);
  sortedYieldBearingKeysByOwner.delete(ownerId);
};

export const removeYieldBearingTileFromOwnerIndex = (
  yieldBearingTilesByOwner: Map<string, Set<string>>,
  sortedYieldBearingKeysByOwner: Map<string, string[]>,
  tileKey: string,
  ownerId: string
): void => {
  const set = yieldBearingTilesByOwner.get(ownerId);
  if (!set) return;
  set.delete(tileKey);
  sortedYieldBearingKeysByOwner.delete(ownerId);
};

export const fortSupportAnchorMaxRadius = (tile: DomainTileState, ownerId: string): number => {
  if (isSettledTownAnchor(tile, ownerId)) return TOWN_AUTO_FRONTIER_RADIUS;
  return 0;
};

export const registerFortSupportAnchor = (
  activeFortAnchorsByOwner: Map<string, Map<string, number>>,
  tileKey: string,
  ownerId: string,
  maxRadius: number
): void => {
  let map = activeFortAnchorsByOwner.get(ownerId);
  if (!map) {
    map = new Map<string, number>();
    activeFortAnchorsByOwner.set(ownerId, map);
  }
  map.set(tileKey, maxRadius);
};

export const refreshFortAnchorIndexForTile = (input: {
  activeFortAnchorsByOwner: Map<string, Map<string, number>>;
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevMaxRadius = input.previous && prevOwnerId ? fortSupportAnchorMaxRadius(input.previous, prevOwnerId) : 0;
  const nextMaxRadius = nextOwnerId ? fortSupportAnchorMaxRadius(input.next, nextOwnerId) : 0;
  if (prevMaxRadius <= 0 && nextMaxRadius <= 0) return;
  if (prevMaxRadius > 0 && prevOwnerId) input.activeFortAnchorsByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextMaxRadius > 0 && nextOwnerId) {
    registerFortSupportAnchor(input.activeFortAnchorsByOwner, input.tileKey, nextOwnerId, nextMaxRadius);
  }
};

const playerCandidateAnchorMaxRadius = (tile: DomainTileState, ownerId: string): number => {
  const fortRadius = fortSupportAnchorMaxRadius(tile, ownerId);
  if (fortRadius > 0) return fortRadius;
  return 0;
};

export const refreshPlayerCandidateIndexAnchorForTile = (input: {
  playerCandidateIndex: PlayerCandidateIndex;
  tiles: ReadonlyMap<string, DomainTileState>;
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevMaxRadius = input.previous && prevOwnerId ? playerCandidateAnchorMaxRadius(input.previous, prevOwnerId) : 0;
  const nextMaxRadius = nextOwnerId ? playerCandidateAnchorMaxRadius(input.next, nextOwnerId) : 0;
  if (prevMaxRadius <= 0 && nextMaxRadius <= 0) return;
  if (prevMaxRadius > 0 && nextMaxRadius <= 0) {
    input.playerCandidateIndex.unregisterAnchor(input.tileKey);
    return;
  }
  if (prevMaxRadius <= 0 && nextMaxRadius > 0) {
    input.playerCandidateIndex.registerAnchor(input.tileKey, nextOwnerId!, nextMaxRadius, (key) => input.tiles.get(key));
    return;
  }
  if (prevOwnerId !== nextOwnerId || prevMaxRadius !== nextMaxRadius) {
    input.playerCandidateIndex.unregisterAnchor(input.tileKey);
    input.playerCandidateIndex.registerAnchor(input.tileKey, nextOwnerId!, nextMaxRadius, (key) => input.tiles.get(key));
  }
};

export const registerRuntimeTileAnchor = (input: {
  playerCandidateIndex: PlayerCandidateIndex;
  activeFortAnchorsByOwner: Map<string, Map<string, number>>;
  activeSiegeOutpostsByOwner: Map<string, Set<string>>;
  activeLightOutpostsByOwner: Map<string, Set<string>>;
  tiles: ReadonlyMap<string, DomainTileState>;
  tileKey: string;
  tile: DomainTileState;
}): void => {
  const ownerId = input.tile.ownerId;
  if (!ownerId) return;
  const candidateRadius = playerCandidateAnchorMaxRadius(input.tile, ownerId);
  if (candidateRadius > 0) input.playerCandidateIndex.registerAnchor(input.tileKey, ownerId, candidateRadius, (key) => input.tiles.get(key));
  const fortRadius = fortSupportAnchorMaxRadius(input.tile, ownerId);
  if (fortRadius > 0) registerFortSupportAnchor(input.activeFortAnchorsByOwner, input.tileKey, ownerId, fortRadius);
  if (isSiegeOutpostActive(input.tile, ownerId)) addTileToOwnerSet(input.activeSiegeOutpostsByOwner, input.tileKey, ownerId);
  if (isLightOutpostActive(input.tile, ownerId)) addTileToOwnerSet(input.activeLightOutpostsByOwner, input.tileKey, ownerId);
};

export const refreshRuntimeTileIndexesForChange = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  frontierTilesByOwner: Map<string, Set<string>>;
  activeFortAnchorsByOwner: Map<string, Map<string, number>>;
  yieldBearingTilesByOwner: Map<string, Set<string>>;
  sortedYieldBearingKeysByOwner: Map<string, string[]>;
  activeSiegeOutpostsByOwner: Map<string, Set<string>>;
  activeLightOutpostsByOwner: Map<string, Set<string>>;
  musterTilesByOwner: Map<string, Set<string>>;
  fortTilesByOwner: Map<string, Set<string>>;
  railDepotTilesByOwner: Map<string, Set<string>>;
}): void => {
  const prevIsFrontier = input.previous?.ownershipState === "FRONTIER" && input.previous?.ownerId && !input.previous.ownerId.startsWith("barbarian-");
  const nextIsFrontier = input.next.ownershipState === "FRONTIER" && input.next.ownerId && !input.next.ownerId.startsWith("barbarian-");
  if (prevIsFrontier && input.previous!.ownerId !== input.next.ownerId) {
    removeFrontierTileFromOwnerIndex(input.frontierTilesByOwner, input.tileKey, input.previous!.ownerId!);
  }
  if (nextIsFrontier) {
    addFrontierTileToOwnerIndex(input.frontierTilesByOwner, input.tileKey, input.next.ownerId!);
  } else if (prevIsFrontier && input.previous!.ownerId === input.next.ownerId) {
    removeFrontierTileFromOwnerIndex(input.frontierTilesByOwner, input.tileKey, input.next.ownerId!);
  }
  refreshFortAnchorIndexForTile(input);
  refreshYieldBearingIndexForTile(input);
  refreshSiegeOutpostIndexForTile(input);
  refreshLightOutpostIndexForTile(input);
  refreshMusterIndexForTile(input);
  refreshFortGarrisonIndexForTile(input);
  refreshRailDepotIndexForTile(input);
};

/**
 * Keeps the per-player economy snapshot, tile-yield context, defensibility
 * metrics, and upkeep accrual caches in sync with a tile mutation.
 *
 * The economy snapshot and tile-yield context builders only iterate
 * ownershipState === "SETTLED" tiles, so frontier-only mutations (territory
 * expansion, muster, pop growth) cannot change their output — invalidating
 * them on every tile change would force an O(settled-tiles) rebuild (BFS +
 * town network) on the next read even when nothing relevant changed.
 * Defensibility metrics count all owned tiles (frontier + settled), so they
 * are invalidated unconditionally. Upkeep accrual is maintained incrementally
 * (O(1) add/subtract) instead of invalidated.
 */
export const refreshEconomyCachesForTileChange = (input: {
  previous: DomainTileState | undefined;
  next: DomainTileState;
  players: ReadonlyMap<string, RuntimePlayer>;
  economySnapshotCacheByPlayer: Map<string, PlayerUpdateEconomySnapshot>;
  tileYieldContextCacheByPlayer: Map<string, RuntimeTileYieldEconomyContext>;
  townNetworkCacheByPlayer: Map<string, Map<string, ConnectedTownNetworkEntry>>;
  defensibilityMetricsCacheByPlayer: Map<string, { T: number; E: number; Ts: number; Es: number }>;
  upkeepAccrualCacheByPlayer: Map<string, UpkeepAccrualSnapshot>;
}): void => {
  const { previous, next, players } = input;
  if (previous?.ownerId) {
    if (previous.ownershipState === "SETTLED") {
      input.economySnapshotCacheByPlayer.delete(previous.ownerId);
      input.tileYieldContextCacheByPlayer.delete(previous.ownerId);
      input.townNetworkCacheByPlayer.delete(previous.ownerId);
    }
    input.defensibilityMetricsCacheByPlayer.delete(previous.ownerId);
    const prevPlayer = players.get(previous.ownerId);
    const prevUpkeep = input.upkeepAccrualCacheByPlayer.get(previous.ownerId);
    if (prevPlayer && prevUpkeep) removeTileUpkeepFromCache(prevUpkeep, previous, previous.ownerId, prevPlayer);
  }
  if (next.ownerId) {
    if (next.ownershipState === "SETTLED") {
      input.economySnapshotCacheByPlayer.delete(next.ownerId);
      input.tileYieldContextCacheByPlayer.delete(next.ownerId);
      input.townNetworkCacheByPlayer.delete(next.ownerId);
    }
    input.defensibilityMetricsCacheByPlayer.delete(next.ownerId);
    const nextPlayer = players.get(next.ownerId);
    const nextUpkeep = input.upkeepAccrualCacheByPlayer.get(next.ownerId);
    if (nextPlayer && nextUpkeep) addTileUpkeepToCache(nextUpkeep, next, next.ownerId, nextPlayer);
  }
};

export const rebuildPlannerCandidateIndexesForPlayer = (input: {
  playerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  summary: PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
  /** Optional hook called after the full rebuild so callers can re-sync an
   *  incremental cache from the now-correct summary Sets. */
  onCandidateRebuildComplete?: (playerId: string, summary: PlayerRuntimeSummary) => void;
}): void => {
  input.summary.hotFrontierTileKeys.clear();
  input.summary.strategicFrontierTileKeys.clear();
  input.summary.buildCandidateTileKeys.clear();
  for (const tileKey of input.summary.territoryTileKeys) {
    const tile = input.tiles.get(tileKey);
    if (!tile || tile.ownerId !== input.playerId) continue;
    if (isHotFrontierTile(input.playerId, tile, input.tiles)) input.summary.hotFrontierTileKeys.add(tileKey);
    if (isStrategicFrontierTile(input.playerId, tile, input.tiles)) input.summary.strategicFrontierTileKeys.add(tileKey);
    if (isBuildCandidateTile(input.playerId, tile, input.tiles)) input.summary.buildCandidateTileKeys.add(tileKey);
  }
  input.onCandidateRebuildComplete?.(input.playerId, input.summary);
  input.markPlannerPlayerTileCollectionDirty(input.playerId);
};

export const refreshPlannerCandidateIndexesAroundTileChange = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState | undefined;
  tiles: ReadonlyMap<string, DomainTileState>;
  playerCandidateIndex: PlayerCandidateIndex;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
  /** Optional hook called once per affected player, AFTER the summary Sets have
   *  been updated for `affectedKeys`, so callers can mirror the same deltas
   *  into an incremental cache.  Receives the player id, the set of candidate
   *  tile keys that were touched, and the up-to-date summary. */
  onCandidateKeysUpdated?: (
    playerId: string,
    affectedKeys: ReadonlySet<string>,
    summary: PlayerRuntimeSummary
  ) => void;
}): void => {
  const affectedKeys = candidateIndexKeysAroundTileKey(input.tileKey);
  const affectedPlayerIds = playerIdsAffectedByTileChange(input.tileKey, input.tiles, input.previous, input.next);
  for (const playerId of affectedPlayerIds) {
    const summary = input.summaryForPlayer(playerId);
    for (const candidateKey of affectedKeys) {
      summary.hotFrontierTileKeys.delete(candidateKey);
      summary.strategicFrontierTileKeys.delete(candidateKey);
      summary.buildCandidateTileKeys.delete(candidateKey);
      const candidateTile = input.tiles.get(candidateKey);
      if (!candidateTile || candidateTile.ownerId !== playerId) continue;
      if (isHotFrontierTile(playerId, candidateTile, input.tiles)) summary.hotFrontierTileKeys.add(candidateKey);
      if (isStrategicFrontierTile(playerId, candidateTile, input.tiles)) summary.strategicFrontierTileKeys.add(candidateKey);
      if (isBuildCandidateTile(playerId, candidateTile, input.tiles)) summary.buildCandidateTileKeys.add(candidateKey);
    }
    input.onCandidateKeysUpdated?.(playerId, affectedKeys, summary);
    input.markPlannerPlayerTileCollectionDirty(playerId);
  }
  input.playerCandidateIndex.refreshAroundTile(input.tileKey, (key) => input.tiles.get(key));
};

const refreshYieldBearingIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  yieldBearingTilesByOwner: Map<string, Set<string>>;
  sortedYieldBearingKeysByOwner: Map<string, string[]>;
}): void => {
  const prevIsYieldBearing = input.previous ? isYieldBearingTile(input.previous) : false;
  const nextIsYieldBearing = isYieldBearingTile(input.next);
  if (prevIsYieldBearing && input.previous?.ownerId) {
    removeYieldBearingTileFromOwnerIndex(input.yieldBearingTilesByOwner, input.sortedYieldBearingKeysByOwner, input.tileKey, input.previous.ownerId);
  }
  if (nextIsYieldBearing && input.next.ownerId) {
    addYieldBearingTileToOwnerIndex(input.yieldBearingTilesByOwner, input.sortedYieldBearingKeysByOwner, input.tileKey, input.next.ownerId);
  }
};

const isSiegeOutpostActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active";

const isLightOutpostActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.ownerId === ownerId &&
  tile.economicStructure.type === "LIGHT_OUTPOST" &&
  tile.economicStructure.status === "active";

const refreshSiegeOutpostIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeSiegeOutpostsByOwner: Map<string, Set<string>>;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevActive = input.previous && prevOwnerId ? isSiegeOutpostActive(input.previous, prevOwnerId) : false;
  const nextActive = nextOwnerId ? isSiegeOutpostActive(input.next, nextOwnerId) : false;
  if (!prevActive && !nextActive) return;
  if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
  if (prevActive && prevOwnerId) input.activeSiegeOutpostsByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextActive && nextOwnerId) addTileToOwnerSet(input.activeSiegeOutpostsByOwner, input.tileKey, nextOwnerId);
};

const refreshLightOutpostIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeLightOutpostsByOwner: Map<string, Set<string>>;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevActive = input.previous && prevOwnerId ? isLightOutpostActive(input.previous, prevOwnerId) : false;
  const nextActive = nextOwnerId ? isLightOutpostActive(input.next, nextOwnerId) : false;
  if (!prevActive && !nextActive) return;
  if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
  if (prevActive && prevOwnerId) input.activeLightOutpostsByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextActive && nextOwnerId) addTileToOwnerSet(input.activeLightOutpostsByOwner, input.tileKey, nextOwnerId);
};

const refreshMusterIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  musterTilesByOwner: Map<string, Set<string>>;
}): void => {
  const prevOwnerId = input.previous?.muster?.ownerId;
  const nextOwnerId = input.next.muster?.ownerId;
  if (prevOwnerId === nextOwnerId) return;
  if (prevOwnerId) input.musterTilesByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextOwnerId) addTileToOwnerSet(input.musterTilesByOwner, input.tileKey, nextOwnerId);
};

export const isFortActive = (tile: DomainTileState): boolean =>
  tile.fort?.status === "active" && tile.fort.ownerId != null;

const refreshFortGarrisonIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  fortTilesByOwner: Map<string, Set<string>>;
}): void => {
  const prevActive = input.previous ? isFortActive(input.previous) : false;
  const prevOwnerId = prevActive ? input.previous!.fort!.ownerId : undefined;
  const nextActive = isFortActive(input.next);
  const nextOwnerId = nextActive ? input.next.fort!.ownerId : undefined;
  if (prevOwnerId === nextOwnerId) return;
  if (prevOwnerId) input.fortTilesByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextOwnerId) addTileToOwnerSet(input.fortTilesByOwner, input.tileKey, nextOwnerId);
};

const isRailDepotActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.type === "RAIL_DEPOT" &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshRailDepotIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  railDepotTilesByOwner: Map<string, Set<string>>;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevActive = input.previous && prevOwnerId ? isRailDepotActive(input.previous, prevOwnerId) : false;
  const nextActive = nextOwnerId ? isRailDepotActive(input.next, nextOwnerId) : false;
  if (!prevActive && !nextActive) return;
  if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
  if (prevActive && prevOwnerId) input.railDepotTilesByOwner.get(prevOwnerId)?.delete(input.tileKey);
  if (nextActive && nextOwnerId) addTileToOwnerSet(input.railDepotTilesByOwner, input.tileKey, nextOwnerId);
};

const addTileToOwnerSet = (index: Map<string, Set<string>>, tileKey: string, ownerId: string): void => {
  let set = index.get(ownerId);
  if (!set) {
    set = new Set<string>();
    index.set(ownerId, set);
  }
  set.add(tileKey);
};

// Resources are intentionally excluded — they are local frontier targets handled
// by the planner candidate index. Beacons are distant strategic targets (towns,
// docks) the AI navigates toward across the map. Excluding resources also keeps
// the set small (O(towns+docks) instead of O(world_size/3)) so the O(B×T)
// expansion objective is cheap even without sampling.
export const isNeutralBeaconTile = (tile: DomainTileState): boolean => {
  if (tile.ownerId) return false;
  if (tile.terrain !== "LAND") return false;
  return Boolean(tile.town || tile.dockId);
};

export const refreshNeutralBeaconIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  neutralBeaconTileKeys: Set<string>;
}): boolean => {
  const prevIsBeacon = input.previous ? isNeutralBeaconTile(input.previous) : false;
  const nextIsBeacon = isNeutralBeaconTile(input.next);
  if (prevIsBeacon === nextIsBeacon) return false;
  if (nextIsBeacon) input.neutralBeaconTileKeys.add(input.tileKey);
  else input.neutralBeaconTileKeys.delete(input.tileKey);
  return true;
};

export const assertYieldIndexCorrect = (input: {
  playerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  yieldBearingTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  summary: PlayerRuntimeSummary;
  now: number;
  yieldContext: RuntimeTileYieldEconomyContext;
}): void => {
  void input.now;
  void input.yieldContext;
  const expected = new Set<string>();
  for (const tileKey of input.summary.territoryTileKeys) {
    const tile = input.tiles.get(tileKey);
    if (tile && isYieldBearingTile(tile)) expected.add(tileKey);
  }
  const actual = input.yieldBearingTilesByOwner.get(input.playerId) ?? new Set<string>();
  let ok = true;
  for (const key of expected) {
    if (!actual.has(key)) { ok = false; console.error(`[YIELD-INDEX] player=${input.playerId} MISSING from index: ${key}`); }
  }
  for (const key of actual) {
    if (!expected.has(key)) { ok = false; console.error(`[YIELD-INDEX] player=${input.playerId} SPURIOUS in index: ${key}`); }
  }
  if (ok) console.debug(`[YIELD-INDEX] player=${input.playerId} OK expected=${expected.size} actual=${actual.size}`);
};
