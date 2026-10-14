import type { DomainTileState } from "@border-empires/game-domain";
import type { PlayerCandidateIndex } from "./player-candidate-index/player-candidate-index.js";
import {
  candidateIndexKeysAroundTileKey,
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile,
  playerIdsAffectedByTileChange
} from "./ai/planner-candidate-index.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
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
      case "UMBRITE_WORKS":
      case "HIGH_YIELD_UMBRITE_WORKS":
      case "TITANIUM_WORKS":
      case "HIGH_YIELD_TITANIUM_WORKS":
      case "AETHER_CONDENSER":
      case "HIGH_YIELD_AETHER_CONDENSER":
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

export const refreshRuntimeTileIndexesForChange = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  frontierTilesByOwner: Map<string, Set<string>>;
  activeFortAnchorsByOwner: Map<string, Map<string, number>>;
  yieldBearingTilesByOwner: Map<string, Set<string>>;
  sortedYieldBearingKeysByOwner: Map<string, string[]>;
  activeSiegeBatteriesByOwner: Map<string, Set<string>>;
  activeRelayBeaconsByOwner: Map<string, Set<string>>;
  activeObservatoriesByOwner: Map<string, Set<string>>;
  musterTilesByOwner: Map<string, Set<string>>;
  neuralWorksTilesByOwner: Map<string, Set<string>>;
  ancillaryDepotTilesByOwner: Map<string, Set<string>>;
  reserveLatticeTilesByOwner: Map<string, Set<string>>;
  ancillaryFactoryTilesByOwner: Map<string, Set<string>>;
  quartermastersOfficeTilesByOwner: Map<string, Set<string>>;
  incubationEngineTilesByOwner: Map<string, Set<string>>;
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
  refreshSiegeBatteryIndexForTile(input);
  refreshRelayBeaconIndexForTile(input);
  refreshObservatoryIndexForTile(input);
  refreshMusterIndexForTile(input);
  refreshNeuralWorksIndexForTile(input);
  refreshAncillaryDepotIndexForTile(input);
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "RESERVE_LATTICE", index: input.reserveLatticeTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "ANCILLARY_FACTORY", index: input.ancillaryFactoryTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "QUARTERMASTERS_OFFICE", index: input.quartermastersOfficeTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "INCUBATION_ENGINE", index: input.incubationEngineTilesByOwner });
  refreshEconomicStructureTypeIndexForTile({ ...input, structureType: "CENSUS_HALL", index: input.censusHallTilesByOwner });
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

export const isSiegeBatteryActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.siegeBattery?.ownerId === ownerId && tile.siegeBattery.status === "active";

export const isRelayBeaconActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.ownerId === ownerId &&
  tile.economicStructure.type === "RELAY_BEACON" &&
  tile.economicStructure.status === "active";

export const isObservatoryActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.observatory?.ownerId === ownerId && tile.observatory.status === "active";

// Shared by refreshSiegeBatteryIndexForTile/refreshRelayBeaconIndexForTile/
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

const refreshSiegeBatteryIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  activeSiegeBatteriesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.activeSiegeBatteriesByOwner, isActive: isSiegeBatteryActive });

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

const isNeuralWorksActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.type === "NEURAL_WORKS" &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshNeuralWorksIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  neuralWorksTilesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.neuralWorksTilesByOwner, isActive: isNeuralWorksActive });

// Ancillary Depot's flat manpower-cap bonus (§4.4) is a plain per-structure
// count, not tied to any specific town — ANCILLARY_DEPOT uses "same_tile"
// placement (structure-placement-metadata.json), unlike NEURAL_WORKS/
// CLEARING_HOUSE's "town_support" mode, so it can sit on any settled/
// resource/support/dock tile with no adjacency to a town at all. A
// per-town, adjacency-based scan (like the Neural Works/Clearing House
// network membership check) would silently miss any Ancillary Depot not
// built next to a town.
const isAncillaryDepotActive = (tile: DomainTileState, ownerId: string): boolean =>
  tile.economicStructure?.type === "ANCILLARY_DEPOT" &&
  tile.economicStructure.ownerId === ownerId &&
  tile.economicStructure.status === "active";

const refreshAncillaryDepotIndexForTile = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  ancillaryDepotTilesByOwner: Map<string, Set<string>>;
}): void => refreshActiveStructureIndexForTile({ ...input, index: input.ancillaryDepotTilesByOwner, isActive: isAncillaryDepotActive });

// Same shape as refreshNeuralWorksIndexForTile/refreshAncillaryDepotIndexForTile
// above, parameterized by economicStructure.type instead of a fixed one —
// used for the tech-tree redesign's new Manpower-branch buildings (Assembly
// Works, Ancillary Factory, Quartermaster's Office, Incubation Engine,
// Census Hall) so each new per-owner tile-set index doesn't need its own
// hand-copied isXActive predicate. None of these are tied to a specific town
// the way Neural Works/Clearing House's "only one per connected-town network"
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
