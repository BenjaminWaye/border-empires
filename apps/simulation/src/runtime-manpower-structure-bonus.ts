import type { DomainTileState } from "@border-empires/game-domain";
import type { MonumentalStructureType } from "@border-empires/shared";
import {
  reserveLatticeNetworkAncillaryDepotCountForPlayer,
  neuralWorksNetworkAncillaryFactoryCountForPlayer,
  type ConnectedTownNetworkEntry
} from "./economy-network/economy-network.js";
import { ancillaryFactoryCapacityBonus, resolvedTownCoastal, resolvedTownTerrainProfileId, terrainAdjustedTownManpower } from "@border-empires/shared";
import { countSupportedStructures, reserveLatticeAlreadyInNetwork } from "./economy-network/economy-network.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer } from "./runtime-types.js";

/** §4.4 manpower structure bonuses for one player. */
export type ManpowerStructureBonus = {
  ancillaryDepotCount: number;
  reserveLatticeNetworkAncillaryDepotCount: number;
  neuralWorksNetworkAncillaryFactoryCount: number;
  ancillaryFactoryCount: number;
  censusDirectorateManpowerBuildingCount: number;
  ancillaryFactoryCapacityBonusByTown?: ReadonlyMap<string, number>;
};

/** Dependencies {@link cachedManpowerStructureBonusForPlayer} reads. */
export type ManpowerStructureBonusContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  manpowerStructureBonusCacheByPlayer: Map<string, ManpowerStructureBonus>;
  ancillaryDepotTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  neuralWorksTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  reserveLatticeTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  ancillaryFactoryTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  quartermastersOfficeTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  incubationEngineTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  censusHallTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  townNetworkCacheByPlayer: ReadonlyMap<string, Map<string, ConnectedTownNetworkEntry>>;
  activeMonumentOwnerByType: ReadonlyMap<MonumentalStructureType, { ownerId: string; tileKey: string }>;
  dormantEconomicStructureKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  settledTilesForPlayer: (playerId: string) => DomainTileState[];
  rebuildTownNetworkUninstrumented: (player: RuntimePlayer, settledTiles: DomainTileState[]) => Map<string, ConnectedTownNetworkEntry>;
};

/**
 * Extracted from runtime.ts (500-line source budget, see AGENTS.md) — this is
 * the manpower read that fires on essentially every command and periodic tick,
 * so it is worth keeping legible on its own.
 */
export const cachedManpowerStructureBonusForPlayer = (
  ctx: ManpowerStructureBonusContext,
  player: RuntimePlayer
): ManpowerStructureBonus => {
  const cached = ctx.manpowerStructureBonusCacheByPlayer.get(player.id);
  if (cached) return cached;
  const ancillaryDepotKeys = ctx.ancillaryDepotTilesByOwner.get(player.id);
  const neuralWorksKeys = ctx.neuralWorksTilesByOwner.get(player.id);
  const reserveLatticeKeys = ctx.reserveLatticeTilesByOwner.get(player.id);
  const ancillaryFactoryKeys = ctx.ancillaryFactoryTilesByOwner.get(player.id);
  // §5.4: a dormant Ancillary Depot/Neural Works doesn't grant its bonus —
  // filter the raw existence indices against this player's current
  // dormant-economicStructure set before counting/checking presence. Only
  // computed when the player actually has at least one such structure
  // (rare, same as the pre-existing hasAnyNeuralWorks gate below): this is a
  // manpower read fired on essentially every command and periodic tick
  // (including during SimulationRuntime construction, before
  // trackSyncMainThreadTask is safe to route through — see below), so an
  // unconditional dormancy computation here would pre-warm
  // resourceSlotSupplyCacheByPlayer/resourceSlotDemandCacheByPlayer too
  // early and poison them with a stale pre-tile-setup value that never
  // gets invalidated (initial tile hydration doesn't go through
  // replaceTileState/refreshEconomyCachesForTileChange).
  const dormantEconomicStructureKeys =
    (ancillaryDepotKeys?.size ?? 0) > 0 ||
    (neuralWorksKeys?.size ?? 0) > 0 ||
    (reserveLatticeKeys?.size ?? 0) > 0 ||
    (ancillaryFactoryKeys?.size ?? 0) > 0
      ? ctx.dormantEconomicStructureKeysForPlayer(player.id)
      : undefined;
  const ancillaryDepotCount = ancillaryDepotKeys
    ? dormantEconomicStructureKeys
      ? [...ancillaryDepotKeys].filter((key) => !dormantEconomicStructureKeys.has(key)).length
      : ancillaryDepotKeys.size
    : 0;
  const ancillaryFactoryCount = ancillaryFactoryKeys
    ? dormantEconomicStructureKeys
      ? [...ancillaryFactoryKeys].filter((key) => !dormantEconomicStructureKeys.has(key)).length
      : ancillaryFactoryKeys.size
    : 0;
  const hasAnyNeuralWorks = neuralWorksKeys
    ? dormantEconomicStructureKeys
      ? [...neuralWorksKeys].some((key) => !dormantEconomicStructureKeys.has(key))
      : neuralWorksKeys.size > 0
    : false;
  const hasAnyReserveLattice = reserveLatticeKeys
    ? dormantEconomicStructureKeys
      ? [...reserveLatticeKeys].some((key) => !dormantEconomicStructureKeys.has(key))
      : reserveLatticeKeys.size > 0
    : false;
  // Only touch the connected-town network when the player actually has a
  // Neural Works or Reserve Lattice — the common case (none yet) skips it
  // entirely, which matters for two reasons: it keeps this O(1) instead of
  // O(settled tiles + towns²) for most players, and it avoids pre-warming
  // townNetworkCacheByPlayer as a side effect of a manpower read (this
  // fires during SimulationRuntime construction too, before
  // trackSyncMainThreadTask is safe to route through — see below).
  let neuralWorksNetworkAncillaryFactoryCount = 0;
  let reserveLatticeNetworkAncillaryDepotCount = 0;
  if (hasAnyNeuralWorks || hasAnyReserveLattice) {
    const summary = ctx.summaryForPlayer(player.id);
    const settledTiles = ctx.settledTilesForPlayer(player.id);
    // Reuse the shared town-network cache if it's already warm, but do NOT
    // go through cachedTownNetworkForPlayer's trackSyncMainThreadTask
    // wrapper on a cold cache: playerManpowerCap (and so this method) fires
    // during SimulationRuntime construction (applyManpowerRegen for
    // initial players), before simulation-service.ts's module-level
    // `simulationMetrics` has finished initializing — routing an uncached
    // rebuild through that instrumentation this early throws a
    // temporal-dead-zone ReferenceError. Building directly still populates
    // townNetworkCacheByPlayer, so later, instrumented callers still get a
    // cache hit.
    const townNetwork = ctx.townNetworkCacheByPlayer.get(player.id) ?? ctx.rebuildTownNetworkUninstrumented(player, settledTiles);
    if (hasAnyNeuralWorks) {
      neuralWorksNetworkAncillaryFactoryCount = neuralWorksNetworkAncillaryFactoryCountForPlayer(
        player.id,
        ctx.tiles,
        townNetwork,
        summary.ownedTownTierByTile.keys(),
        dormantEconomicStructureKeys
      );
    }
    if (hasAnyReserveLattice) {
      reserveLatticeNetworkAncillaryDepotCount = reserveLatticeNetworkAncillaryDepotCountForPlayer(
        player.id,
        ctx.tiles,
        townNetwork,
        summary.ownedTownTierByTile.keys(),
        dormantEconomicStructureKeys
      );
    }
  }
  // Census Directorate (monument, single-per-map): only its owner gets the
  // empire-wide regen bonus, scaling with the count of Manpower-branch
  // buildings they own. Reads the O(1) activeMonumentOwnerByType index
  // rather than scanning all tiles: this fires on essentially every command
  // under load (manpowerStructureBonusCacheByPlayer is invalidated on every
  // tile-ownership change, §5.4), and the full-map scan it replaces was the
  // dominant main-thread cost in load testing.
  let censusDirectorateManpowerBuildingCount = 0;
  const summary = ctx.summaryForPlayer(player.id);
  const localTownNetwork = ctx.townNetworkCacheByPlayer.get(player.id) ?? new Map<string, ConnectedTownNetworkEntry>();
  const ancillaryFactoryCapacityBonusByTown = new Map<string, number>();
  for (const townKey of summary.ownedTownTierByTile.keys()) {
    const townTile = ctx.tiles.get(townKey);
    if (!townTile?.town) continue;
    const factoryCount = countSupportedStructures(player.id, townTile, "ANCILLARY_DEPOT", ctx.tiles, dormantEconomicStructureKeys ?? new Set());
    if (factoryCount <= 0) continue;
    const base = terrainAdjustedTownManpower(
      townTile.town.populationTier,
      resolvedTownTerrainProfileId(townTile.town.terrainProfile, townTile.landBiome),
      resolvedTownCoastal(townTile.town.terrainProfile, townTile.landBiome, townTile.town.coastal)
    ).cap;
    ancillaryFactoryCapacityBonusByTown.set(townKey, ancillaryFactoryCapacityBonus(base, factoryCount, reserveLatticeAlreadyInNetwork(player.id, townKey, ctx.tiles, localTownNetwork)));
  }
  if (ctx.activeMonumentOwnerByType.get("CENSUS_DIRECTORATE")?.ownerId === player.id) {
    censusDirectorateManpowerBuildingCount =
      ancillaryDepotCount +
      ancillaryFactoryCount +
      (neuralWorksKeys?.size ?? 0) +
      (reserveLatticeKeys?.size ?? 0) +
      (ctx.quartermastersOfficeTilesByOwner.get(player.id)?.size ?? 0) +
      (ctx.incubationEngineTilesByOwner.get(player.id)?.size ?? 0) +
      (ctx.censusHallTilesByOwner.get(player.id)?.size ?? 0);
  }
  const result: ManpowerStructureBonus = {
    ancillaryDepotCount,
    reserveLatticeNetworkAncillaryDepotCount,
    neuralWorksNetworkAncillaryFactoryCount,
    ancillaryFactoryCount,
    censusDirectorateManpowerBuildingCount,
    ...(ancillaryFactoryCapacityBonusByTown.size > 0 ? { ancillaryFactoryCapacityBonusByTown } : {})
  };
  ctx.manpowerStructureBonusCacheByPlayer.set(player.id, result);
  return result;
};
