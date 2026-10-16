import type { DomainTileState } from "@border-empires/game-domain";

import {
  isObservatoryActive,
  isRelayBeaconActive,
  isSiegeBatteryActive,
  isYieldBearingTile,
  refreshActiveStructureIndexForTile,
  refreshRuntimeTileIndexesForChange
} from "../runtime-tile-index-maintenance.js";

const addToOwnerIndex = (index: Map<string, Set<string>>, ownerId: string, tileKey: string): void => {
  let set = index.get(ownerId);
  if (!set) {
    set = new Set<string>();
    index.set(ownerId, set);
  }
  set.add(tileKey);
};

/**
 * Per-owner tile-key indexes that let ticks and contexts enumerate one
 * player's frontier tiles, anchors and structures without scanning the map.
 * Derived state: seeded from the tiles at boot (seedFromBootTile and
 * seedStructuresFromBootTile) and kept current on every tile write
 * (refreshForTileChange, see runtime-tile-index-maintenance.ts). Never
 * snapshotted.
 */
export class RuntimeOwnerTileIndexes {
  // Non-barbarian FRONTIER tiles per owner.
  readonly frontierTilesByOwner = new Map<string, Set<string>>();
  // Part 2: index of fort/town anchors that grant frontier support per owner.
  readonly activeFortAnchorsByOwner = new Map<string, Map<string, number>>();
  // Index of yield-bearing SETTLED LAND tiles per owner. A tile is yield-bearing
  // iff it has town, dockId, a strategic resource, or an active converter
  // economicStructure. Used by the AI expansion objective to sample enemy
  // high-value targets without scanning every settled tile.
  readonly yieldBearingTilesByOwner = new Map<string, Set<string>>();
  // Active siege battery tiles per owner (SIEGE_BATTERY / SIEGE_TOWER / DREAD_TOWER).
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  readonly activeSiegeBatteriesByOwner = new Map<string, Set<string>>();
  // Active RELAY_BEACON economic structure tiles per owner.
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  readonly activeRelayBeaconsByOwner = new Map<string, Set<string>>();
  // Same role as activeRelayBeaconsByOwner, for active Observatory tiles
  // (drives resyncPlayerObservatoryVisionBonuses, runtime-observatory-vision.ts).
  readonly activeObservatoriesByOwner = new Map<string, Set<string>>();
  // Tiles carrying a muster flag per owner (`muster.ownerId`). Lets the muster
  // accumulation tick enumerate active musters without scanning the map.
  readonly musterTilesByOwner = new Map<string, Set<string>>();
  // Active Neural Works tiles per owner (mustering logistics hub).
  readonly neuralWorksTilesByOwner = new Map<string, Set<string>>();
  // Active Ancillary Depot tiles per owner (§4.4 flat manpower-cap bonus) — a
  // plain per-structure count, not town-adjacency-scoped, since
  // ANCILLARY_DEPOT uses "same_tile" placement and can sit anywhere.
  readonly ancillaryDepotTilesByOwner = new Map<string, Set<string>>();
  // Tech-tree redesign: per-owner tile-set indexes for the new Manpower
  // buildings, maintained the same way as neuralWorksTilesByOwner/
  // ancillaryDepotTilesByOwner (see refreshEconomicStructureTypeIndexForTile
  // in runtime-tile-index-maintenance.ts).
  readonly reserveLatticeTilesByOwner = new Map<string, Set<string>>();
  readonly ancillaryFactoryTilesByOwner = new Map<string, Set<string>>();
  readonly quartermastersOfficeTilesByOwner = new Map<string, Set<string>>();
  readonly incubationEngineTilesByOwner = new Map<string, Set<string>>();
  readonly censusHallTilesByOwner = new Map<string, Set<string>>();
  // Boot seeding only: which index each active manpower building lands in.
  private readonly manpowerStructureIndexByType: ReadonlyMap<string, Map<string, Set<string>>> = new Map([
    ["NEURAL_WORKS", this.neuralWorksTilesByOwner],
    ["ANCILLARY_DEPOT", this.ancillaryDepotTilesByOwner],
    ["RESERVE_LATTICE", this.reserveLatticeTilesByOwner],
    ["ANCILLARY_FACTORY", this.ancillaryFactoryTilesByOwner],
    ["QUARTERMASTERS_OFFICE", this.quartermastersOfficeTilesByOwner],
    ["INCUBATION_ENGINE", this.incubationEngineTilesByOwner],
    ["CENSUS_HALL", this.censusHallTilesByOwner]
  ]);

  refreshForTileChange(tileKey: string, previous: DomainTileState | undefined, next: DomainTileState): void {
    refreshRuntimeTileIndexesForChange({
      tileKey,
      previous,
      next,
      frontierTilesByOwner: this.frontierTilesByOwner,
      activeFortAnchorsByOwner: this.activeFortAnchorsByOwner,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      activeSiegeBatteriesByOwner: this.activeSiegeBatteriesByOwner,
      activeRelayBeaconsByOwner: this.activeRelayBeaconsByOwner,
      activeObservatoriesByOwner: this.activeObservatoriesByOwner,
      musterTilesByOwner: this.musterTilesByOwner,
      neuralWorksTilesByOwner: this.neuralWorksTilesByOwner,
      ancillaryDepotTilesByOwner: this.ancillaryDepotTilesByOwner,
      reserveLatticeTilesByOwner: this.reserveLatticeTilesByOwner,
      ancillaryFactoryTilesByOwner: this.ancillaryFactoryTilesByOwner,
      quartermastersOfficeTilesByOwner: this.quartermastersOfficeTilesByOwner,
      incubationEngineTilesByOwner: this.incubationEngineTilesByOwner,
      censusHallTilesByOwner: this.censusHallTilesByOwner
    });
  }

  /** Boot, first pass over every tile: the frontier and yield-bearing indexes. */
  seedFromBootTile(tileKey: string, tile: DomainTileState): void {
    if (tile.ownershipState === "FRONTIER" && tile.ownerId && !tile.ownerId.startsWith("barbarian-")) {
      addToOwnerIndex(this.frontierTilesByOwner, tile.ownerId, tileKey);
    }
    if (isYieldBearingTile(tile) && tile.ownerId) addToOwnerIndex(this.yieldBearingTilesByOwner, tile.ownerId, tileKey);
  }

  /** Boot, second pass over owned tiles: the active siege battery, relay beacon and observatory indexes. */
  seedActiveStructuresFromBootTile(tileKey: string, tile: DomainTileState): void {
    // previous: undefined — boot has no prior tile state.
    refreshActiveStructureIndexForTile({ tileKey, previous: undefined, next: tile, index: this.activeSiegeBatteriesByOwner, isActive: isSiegeBatteryActive });
    refreshActiveStructureIndexForTile({ tileKey, previous: undefined, next: tile, index: this.activeRelayBeaconsByOwner, isActive: isRelayBeaconActive });
    refreshActiveStructureIndexForTile({ tileKey, previous: undefined, next: tile, index: this.activeObservatoriesByOwner, isActive: isObservatoryActive });
  }

  /** Boot, second pass over owned tiles: the muster and manpower-building indexes. */
  seedMusterAndManpowerStructuresFromBootTile(tileKey: string, tile: DomainTileState): void {
    if (tile.muster?.ownerId) addToOwnerIndex(this.musterTilesByOwner, tile.muster.ownerId, tileKey);
    const structure = tile.economicStructure;
    if (!structure?.ownerId || structure.status !== "active") return;
    const index = this.manpowerStructureIndexByType.get(structure.type);
    if (index) addToOwnerIndex(index, structure.ownerId, tileKey);
  }
}
