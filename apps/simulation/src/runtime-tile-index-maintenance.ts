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
import type { ResourceSlotDormancy, ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import {
  addTileUpkeepToCache,
  removeTileUpkeepFromCache,
  type UpkeepAccrualSnapshot
} from "./player-upkeep-incremental/player-upkeep-incremental.js";
import {
  maintainTownConnectivityForTileChange,
  type TownConnectivityState
} from "./economy-network/town-connectivity-incremental.js";
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
      case "TITANIUM":
      case "UMBRITE":
      case "GEMS":
        return true;
      default:
        break;
    }
  }
  if (tile.economicStructure?.status === "active") {
    switch (tile.economicStructure.type) {
      case "UMBRITE_SYNTHESIZER":
      case "ADVANCED_UMBRITE_SYNTHESIZER":
      case "TITANIUM_WORKS":
      case "ADVANCED_TITANIUM_WORKS":
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
  activeRelayBeaconsByOwner: Map<string, Set<string>>;
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
  if (isRelayBeaconActive(input.tile, ownerId)) addTileToOwnerSet(input.activeRelayBeaconsByOwner, input.tileKey, ownerId);
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
  activeRelayBeaconsByOwner: Map<string, Set<string>>;
  activeObservatoriesByOwner: Map<string, Set<string>>;
  musterTilesByOwner: Map<string, Set<string>>;
  railDepotTilesByOwner: Map<string, Set<string>>;
  garrisonHallTilesByOwner: Map<string, Set<string>>;
  assemblyWorksTilesByOwner: Map<string, Set<string>>;
  logisticsGuildTilesByOwner: Map<string, Set<string>>;
  quartermastersOfficeTilesByOwner: Map<string, Set<string>>;
  granaryTilesByOwner: Map<string, Set<string>>;
  censusHallTilesByOwner: Map<string, Set<string>>;
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
  refreshRelayBeaconIndexForTile(input);
  refreshObservatoryIndexForTile(input);
  refreshMusterIndexForTile(input);
  refreshRailDepotIndexForTile(input);
  refreshGarrisonHallIndexForTile(input);
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "ASSEMBLY_WORKS", index: input.assemblyWorksTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "LOGISTICS_GUILD", index: input.logisticsGuildTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "QUARTERMASTERS_OFFICE", index: input.quartermastersOfficeTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "GRANARY", index: input.granaryTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "CENSUS_HALL", index: input.censusHallTilesByOwner });
};

/**
 * Keeps the per-player economy snapshot, tile-yield context, town network,
 * defensibility metrics, and upkeep accrual caches in sync with a tile
 * mutation.
 *
 * The economy snapshot and tile-yield context builders only iterate
 * ownershipState === "SETTLED" tiles, so frontier-only mutations (territory
 * expansion, muster, pop growth) cannot change their output — invalidating
 * them on every tile change would force an O(settled-tiles) rebuild (BFS +
 * town network) on the next read even when nothing relevant changed.
 * Defensibility metrics count all owned tiles (frontier + settled), so they
 * are invalidated unconditionally. Upkeep accrual is maintained incrementally
 * (O(1) add/subtract) instead of invalidated.
 *
 * townNetworkCacheByPlayer/manpowerStructureBonusCacheByPlayer are also
 * invalidated unconditionally (§5.4): both now fold in
 * dormantEconomicStructureKeysForPlayer, which — like resourceSlotDemand —
 * can change from a FRONTIER-only mutation (a Siege Outpost's TITANIUM/UMBRITE
 * demand tipping some other, possibly-SETTLED structure into or out of
 * dormancy), so the SETTLED-gated branch alone isn't sufficient for them
 * anymore even though their own BFS/scan still only reads SETTLED tiles.
 */
export const refreshEconomyCachesForTileChange = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  players: ReadonlyMap<string, RuntimePlayer>;
  economySnapshotCacheByPlayer: Map<string, PlayerUpdateEconomySnapshot>;
  tileYieldContextCacheByPlayer: Map<string, RuntimeTileYieldEconomyContext>;
  townNetworkCacheByPlayer: Map<string, Map<string, ConnectedTownNetworkEntry>>;
  townConnectivityStateByPlayer: Map<string, TownConnectivityState>;
  defensibilityMetricsCacheByPlayer: Map<string, { T: number; E: number; Ts: number; Es: number }>;
  upkeepAccrualCacheByPlayer: Map<string, UpkeepAccrualSnapshot>;
  // §4.4 Rail Depot network manpower bonus — invalidated alongside
  // townNetworkCacheByPlayer since it's derived from the same network build
  // plus a Garrison Hall/Rail Depot structure scan over the same tiles. Also
  // invalidated unconditionally below (§5.4): both this and
  // townNetworkCacheByPlayer now factor in dormantEconomicStructureKeysForPlayer,
  // which (like resourceSlotDemandCacheByPlayer) can change from a FRONTIER-only
  // mutation (a Siege Outpost's TITANIUM/UMBRITE demand shifting which OTHER,
  // possibly-SETTLED structure is dormant) — the SETTLED-gated branch alone
  // would miss that ripple.
  manpowerStructureBonusCacheByPlayer?: Map<
    string,
    {
      garrisonHallCount: number;
      assemblyWorksNetworkGarrisonHallCount: number;
      railDepotNetworkLogisticsGuildCount: number;
      logisticsGuildCount: number;
      populationBureauManpowerBuildingCount: number;
    }
  >;
  // §5 (resource slots). Supply's own inputs (BASE_SLOTS_BY_TILE_RESOURCE,
  // TILE_SLOT_BOOST_STRUCTURES) only read SETTLED resource tiles, so this used
  // to share the SETTLED-gated invalidation below with economySnapshotCacheByPlayer
  // — but that gate left a real hole: any owned-tile mutation that never
  // touches a SETTLED tile of this owner's (e.g. capturing/claiming a FRONTIER
  // tile) skipped invalidation entirely, so a supply entry that went stale
  // for any other reason had no self-healing trigger short of the owner's
  // next SETTLE/build/abandon — reported in the wild as FOOD supply reading 0
  // despite 40+ settled FARM/FISH tiles, fixed only by abandoning a tile.
  // resourceSlotDormancyCacheByPlayer already reads supply as one of its own
  // inputs (see resourceSlotDormancyForPlayer in runtime.ts) while invalidating
  // unconditionally itself, so gating supply more tightly than its own
  // dependent cache was already an inconsistency independent of the bug above.
  // Now invalidated unconditionally alongside defensibilityMetricsCacheByPlayer
  // (a strict superset of the old SETTLED-only trigger) — the extra rebuilds
  // this costs are the same bounded O(settled tiles) work the SETTLED-gated
  // path already paid, just also on the FRONTIER-only mutations. Demand
  // depends on fort/siegeOutpost/economicStructure on ANY owned tile (Siege
  // Outposts can be FRONTIER, resource-slot-view.ts), so it always needed the
  // unconditional trigger anyway. All three (plus dormancy below) also
  // participate in AI-coalescing dirty-tracking — see the dirty-set params below.
  resourceSlotSupplyCacheByPlayer?: Map<string, ResourceSlotTotals>;
  resourceSlotDemandCacheByPlayer?: Map<string, ResourceSlotTotals>;
  // §5.4: derived from both supply and demand, so it invalidates on the same
  // unconditional trigger as resourceSlotDemandCacheByPlayer (a superset of
  // supply's SETTLED-gated one).
  resourceSlotDormancyCacheByPlayer?: Map<string, ResourceSlotDormancy>;
  // AI-only coalescing (2026-07-29 login-stall investigation): AI players
  // settle/expand continuously and have no live subscriber, so deleting these
  // caches on every single tile change forces a full O(settled-tiles) rebuild
  // on the very next read — often multiple times per second for a fast-growing
  // empire. Marking the player dirty here instead lets cachedEconomySnapshot /
  // cachedDefensibilityMetrics keep serving the still-recent value for a short
  // window (see AI_DERIVED_CACHE_COALESCE_MS in runtime.ts) rather than paying
  // a fresh rebuild for every single mutation. Human players are unaffected —
  // their caches are still deleted immediately below, so a human always sees
  // their own action reflected instantly.
  economySnapshotDirtyPlayerIds: Set<string>;
  defensibilityMetricsDirtyPlayerIds: Set<string>;
  // Same AI-only dirty-marking extended to the resource-slot caches (2026-07-29 follow-up).
  resourceSlotSupplyDirtyPlayerIds?: Set<string>;
  resourceSlotDemandDirtyPlayerIds?: Set<string>;
  resourceSlotDormancyDirtyPlayerIds?: Set<string>;
}): void => {
  const { tileKey, previous, next, players } = input;
  // Corridor union-find upkeep — shared with the progression handlers'
  // setTileState path so the two tile-write routes can't diverge.
  maintainTownConnectivityForTileChange(input.townConnectivityStateByPlayer, tileKey, previous, next);

  // AI: mark dirty, keep serving the stale entry. Human/no dirty set wired: delete immediately (unchanged prior behavior).
  const markDirtyOrDelete = <V>(isAi: boolean | undefined, dirtySet: Set<string> | undefined, cache: Map<string, V> | undefined, ownerId: string): void => {
    if (isAi && dirtySet) dirtySet.add(ownerId); else cache?.delete(ownerId);
  };
  const invalidateEconomyForOwner = (ownerId: string): void => {
    // townNetworkCacheByPlayer is cheap to drop unconditionally: a miss falls
    // back to the incremental union-find (O(towns × 8)), not a full BFS.
    input.townNetworkCacheByPlayer.delete(ownerId);
    const isAi = players.get(ownerId)?.isAi;
    markDirtyOrDelete(isAi, input.economySnapshotDirtyPlayerIds, input.economySnapshotCacheByPlayer, ownerId);
    input.tileYieldContextCacheByPlayer.delete(ownerId);
  };
  const invalidateDefensibilityForOwner = (ownerId: string): void => {
    const isAi = players.get(ownerId)?.isAi;
    markDirtyOrDelete(isAi, input.defensibilityMetricsDirtyPlayerIds, input.defensibilityMetricsCacheByPlayer, ownerId);
    // Unconditional (not gated on this tile's SETTLED state) — see the
    // resourceSlotSupplyCacheByPlayer field comment above for why.
    markDirtyOrDelete(isAi, input.resourceSlotSupplyDirtyPlayerIds, input.resourceSlotSupplyCacheByPlayer, ownerId);
    markDirtyOrDelete(isAi, input.resourceSlotDemandDirtyPlayerIds, input.resourceSlotDemandCacheByPlayer, ownerId);
    markDirtyOrDelete(isAi, input.resourceSlotDormancyDirtyPlayerIds, input.resourceSlotDormancyCacheByPlayer, ownerId);
  };

  if (previous?.ownerId) {
    if (previous.ownershipState === "SETTLED") invalidateEconomyForOwner(previous.ownerId);
    invalidateDefensibilityForOwner(previous.ownerId);
    input.manpowerStructureBonusCacheByPlayer?.delete(previous.ownerId);
    const prevPlayer = players.get(previous.ownerId);
    const prevUpkeep = input.upkeepAccrualCacheByPlayer.get(previous.ownerId);
    if (prevPlayer && prevUpkeep) removeTileUpkeepFromCache(prevUpkeep, previous, previous.ownerId, prevPlayer);
  }
  if (next.ownerId) {
    if (next.ownershipState === "SETTLED") invalidateEconomyForOwner(next.ownerId);
    invalidateDefensibilityForOwner(next.ownerId);
    input.manpowerStructureBonusCacheByPlayer?.delete(next.ownerId);
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

export const isSiegeOutpostActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active";

export const isRelayBeaconActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.ownerId === ownerId &&
  tile.economicStructure.type === "RELAY_BEACON" &&
  tile.economicStructure.status === "active";

export const isObservatoryActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.observatory?.ownerId === ownerId && tile.observatory.status === "active";

// Shared by refreshSiegeOutpostIndexForTile/refreshRelayBeaconIndexForTile/
// refreshObservatoryIndexForTile below — each is "a single owned-tile
// structure field is active for tile.ownerId", differing only in which
// isXActive predicate and which per-owner index Map they maintain. Exported
// so boot seeding (runtime.ts) can call it directly with `previous: undefined`
// instead of duplicating the same isActive checks in a separate helper.
export const refreshActiveStructureIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  index: Map<string, Set<string>>;
  isActive: (tile: DomainTileState, ownerId: string) => boolean;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevActive = input.previous && prevOwnerId ? input.isActive(input.previous, prevOwnerId) : false;
  const nextActive = nextOwnerId ? input.isActive(input.next, nextOwnerId) : false;
  if (!prevActive && !nextActive) return;
  if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
  if (prevActive && prevOwnerId) input.index.get(prevOwnerId)?.delete(input.tileKey);
  if (nextActive && nextOwnerId) addTileToOwnerSet(input.index, input.tileKey, nextOwnerId);
};

const refreshSiegeOutpostIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeSiegeOutpostsByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.activeSiegeOutpostsByOwner, isActive: isSiegeOutpostActive });

const refreshRelayBeaconIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeRelayBeaconsByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.activeRelayBeaconsByOwner, isActive: isRelayBeaconActive });

const refreshObservatoryIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeObservatoriesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.activeObservatoriesByOwner, isActive: isObservatoryActive });

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

const isRailDepotActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.type === "RAIL_DEPOT" &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshRailDepotIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  railDepotTilesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.railDepotTilesByOwner, isActive: isRailDepotActive });

// Garrison Hall's flat manpower-cap bonus (§4.4) is a plain per-structure
// count, not tied to any specific town — GARRISON_HALL uses "same_tile"
// placement (structure-placement-metadata.json), unlike RAIL_DEPOT/
// CLEARING_HOUSE's "town_support" mode, so it can sit on any settled/
// resource/support/dock tile with no adjacency to a town at all. A
// per-town, adjacency-based scan (like the Rail Depot/Clearing House
// network membership check) would silently miss any Garrison Hall not
// built next to a town.
const isGarrisonHallActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.type === "GARRISON_HALL" &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshGarrisonHallIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  garrisonHallTilesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.garrisonHallTilesByOwner, isActive: isGarrisonHallActive });

// Same shape as refreshRailDepotIndexForTile/refreshGarrisonHallIndexForTile
// above, parameterized by economicStructure.type instead of a fixed one —
// used for the tech-tree redesign's new Manpower-branch buildings (Assembly
// Works, Logistics Guild, Quartermaster's Office, Granary/Incubation Engine,
// Census Hall) so each new per-owner tile-set index doesn't need its own
// hand-copied isXActive predicate. None of these are tied to a specific town
// the way Rail Depot/Clearing House's "only one per connected-town network"
// uniqueness check is.
const isEconomicStructureTypeActive = (tile: DomainTileState, ownerId: string, structureType: string): boolean =>
  tile.economicStructure?.type === structureType &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshEconomicStructureTypeIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  structureType: string;
  index: Map<string, Set<string>>;
}): void => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevActive = input.previous && prevOwnerId ? isEconomicStructureTypeActive(input.previous, prevOwnerId, input.structureType) : false;
  const nextActive = nextOwnerId ? isEconomicStructureTypeActive(input.next, nextOwnerId, input.structureType) : false;
  if (!prevActive && !nextActive) return;
  if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
  if (prevActive && prevOwnerId) input.index.get(prevOwnerId)?.delete(input.tileKey);
  if (nextActive && nextOwnerId) addTileToOwnerSet(input.index, input.tileKey, nextOwnerId);
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
