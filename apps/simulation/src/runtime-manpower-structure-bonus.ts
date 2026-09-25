import type { DomainTileState } from "@border-empires/game-domain";
import type { MonumentalStructureType } from "@border-empires/shared";
import {
  assemblyWorksNetworkGarrisonHallCountForPlayer,
  railDepotNetworkLogisticsGuildCountForPlayer,
  type ConnectedTownNetworkEntry
} from "./economy-network/economy-network.js";
import { ancillaryFactoryCapacityBonus, resolvedTownCoastal, resolvedTownTerrainProfileId, terrainAdjustedTownManpower } from "@border-empires/shared";
import { countSupportedStructures } from "./economy-network/economy-network.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer } from "./runtime-types.js";

/**
 * §4.4 manpower structure bonuses for one player.
 *
 * Manifest tree naming/lore pass (docs/manifest-tree-mapping-plan.md) split
 * this into four distinct buildings: Ancillary Depot (flat cap, new),
 * Ancillary Factory/GARRISON_HALL (flat regen — was cap before this pass),
 * Reserve Lattice (terrain-scaled cap, was Ancillary Factory's job before
 * this pass), Neural Works/ASSEMBLY_WORKS (network-scaled regen — was cap
 * amplification before this pass). garrisonHallCount and
 * assemblyWorksNetworkGarrisonHallCount now feed regen, not cap — see
 * playerManpowerRegenPerMinuteFromSummary/playerManpowerCapFromSummary.
 */
export type ManpowerStructureBonus = {
  garrisonHallCount: number;
  assemblyWorksNetworkGarrisonHallCount: number;
  railDepotNetworkLogisticsGuildCount: number;
  logisticsGuildCount: number;
  ancillaryDepotCount: number;
  populationBureauManpowerBuildingCount: number;
  ancillaryFactoryCapacityBonusByTown?: ReadonlyMap<string, number>;
};

/** Dependencies {@link cachedManpowerStructureBonusForPlayer} reads. */
export type ManpowerStructureBonusContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  manpowerStructureBonusCacheByPlayer: Map<string, ManpowerStructureBonus>;
  garrisonHallTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  railDepotTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  assemblyWorksTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  logisticsGuildTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  ancillaryDepotTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  reserveLatticeTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  quartermastersOfficeTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  granaryTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
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
  const garrisonHallKeys = ctx.garrisonHallTilesByOwner.get(player.id);
  const railDepotKeys = ctx.railDepotTilesByOwner.get(player.id);
  const assemblyWorksKeys = ctx.assemblyWorksTilesByOwner.get(player.id);
  const logisticsGuildKeys = ctx.logisticsGuildTilesByOwner.get(player.id);
  const ancillaryDepotKeys = ctx.ancillaryDepotTilesByOwner.get(player.id);
  const reserveLatticeKeys = ctx.reserveLatticeTilesByOwner.get(player.id);
  // §5.4: a dormant Garrison Hall/Rail Depot doesn't grant its bonus —
  // filter the raw existence indices against this player's current
  // dormant-economicStructure set before counting/checking presence. Only
  // computed when the player actually has at least one such structure
  // (rare, same as the pre-existing hasAnyRailDepot gate below): this is a
  // manpower read fired on essentially every command and periodic tick
  // (including during SimulationRuntime construction, before
  // trackSyncMainThreadTask is safe to route through — see below), so an
  // unconditional dormancy computation here would pre-warm
  // resourceSlotSupplyCacheByPlayer/resourceSlotDemandCacheByPlayer too
  // early and poison them with a stale pre-tile-setup value that never
  // gets invalidated (initial tile hydration doesn't go through
  // replaceTileState/refreshEconomyCachesForTileChange).
  const dormantEconomicStructureKeys =
    (garrisonHallKeys?.size ?? 0) > 0 ||
    (railDepotKeys?.size ?? 0) > 0 ||
    (assemblyWorksKeys?.size ?? 0) > 0 ||
    (logisticsGuildKeys?.size ?? 0) > 0 ||
    (ancillaryDepotKeys?.size ?? 0) > 0 ||
    (reserveLatticeKeys?.size ?? 0) > 0
      ? ctx.dormantEconomicStructureKeysForPlayer(player.id)
      : undefined;
  const garrisonHallCount = garrisonHallKeys
    ? dormantEconomicStructureKeys
      ? [...garrisonHallKeys].filter((key) => !dormantEconomicStructureKeys.has(key)).length
      : garrisonHallKeys.size
    : 0;
  const logisticsGuildCount = logisticsGuildKeys
    ? dormantEconomicStructureKeys
      ? [...logisticsGuildKeys].filter((key) => !dormantEconomicStructureKeys.has(key)).length
      : logisticsGuildKeys.size
    : 0;
  const ancillaryDepotCount = ancillaryDepotKeys
    ? dormantEconomicStructureKeys
      ? [...ancillaryDepotKeys].filter((key) => !dormantEconomicStructureKeys.has(key)).length
      : ancillaryDepotKeys.size
    : 0;
  const hasAnyRailDepot = railDepotKeys
    ? dormantEconomicStructureKeys
      ? [...railDepotKeys].some((key) => !dormantEconomicStructureKeys.has(key))
      : railDepotKeys.size > 0
    : false;
  const hasAnyAssemblyWorks = assemblyWorksKeys
    ? dormantEconomicStructureKeys
      ? [...assemblyWorksKeys].some((key) => !dormantEconomicStructureKeys.has(key))
      : assemblyWorksKeys.size > 0
    : false;
  // Only touch the connected-town network when the player actually has a
  // Rail Depot or Assembly Works — the common case (none yet) skips it
  // entirely, which matters for two reasons: it keeps this O(1) instead of
  // O(settled tiles + towns²) for most players, and it avoids pre-warming
  // townNetworkCacheByPlayer as a side effect of a manpower read (this
  // fires during SimulationRuntime construction too, before
  // trackSyncMainThreadTask is safe to route through — see below).
  let railDepotNetworkLogisticsGuildCount = 0;
  let assemblyWorksNetworkGarrisonHallCount = 0;
  if (hasAnyRailDepot || hasAnyAssemblyWorks) {
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
    if (hasAnyRailDepot) {
      railDepotNetworkLogisticsGuildCount = railDepotNetworkLogisticsGuildCountForPlayer(
        player.id,
        ctx.tiles,
        townNetwork,
        summary.ownedTownTierByTile.keys(),
        dormantEconomicStructureKeys
      );
    }
    if (hasAnyAssemblyWorks) {
      assemblyWorksNetworkGarrisonHallCount = assemblyWorksNetworkGarrisonHallCountForPlayer(
        player.id,
        ctx.tiles,
        townNetwork,
        summary.ownedTownTierByTile.keys(),
        dormantEconomicStructureKeys
      );
    }
  }
  // Population Bureau (monument, single-per-map): only its owner gets the
  // empire-wide regen bonus, scaling with the count of Manpower-branch
  // buildings they own. Reads the O(1) activeMonumentOwnerByType index
  // rather than scanning all tiles: this fires on essentially every command
  // under load (manpowerStructureBonusCacheByPlayer is invalidated on every
  // tile-ownership change, §5.4), and the full-map scan it replaces was the
  // dominant main-thread cost in load testing.
  let populationBureauManpowerBuildingCount = 0;
  const summary = ctx.summaryForPlayer(player.id);
  // Reserve Lattice grants the terrain-scaled cap bonus town-by-town (moved
  // here from Ancillary Factory/GARRISON_HALL as part of the Manifest tree
  // naming/lore pass) — its own presence now determines the higher 0.35
  // rate directly, so the network-toggle boolean is always true.
  const ancillaryFactoryCapacityBonusByTown = new Map<string, number>();
  for (const townKey of summary.ownedTownTierByTile.keys()) {
    const townTile = ctx.tiles.get(townKey);
    if (!townTile?.town) continue;
    const latticeCount = countSupportedStructures(player.id, townTile, "RESERVE_LATTICE", ctx.tiles, dormantEconomicStructureKeys ?? new Set());
    if (latticeCount <= 0) continue;
    const base = terrainAdjustedTownManpower(
      townTile.town.populationTier,
      resolvedTownTerrainProfileId(townTile.town.terrainProfile, townTile.landBiome),
      resolvedTownCoastal(townTile.town.terrainProfile, townTile.landBiome, townTile.town.coastal)
    ).cap;
    ancillaryFactoryCapacityBonusByTown.set(townKey, ancillaryFactoryCapacityBonus(base, latticeCount, true));
  }
  if (ctx.activeMonumentOwnerByType.get("POPULATION_BUREAU")?.ownerId === player.id) {
    populationBureauManpowerBuildingCount =
      garrisonHallCount +
      logisticsGuildCount +
      ancillaryDepotCount +
      (railDepotKeys?.size ?? 0) +
      (assemblyWorksKeys?.size ?? 0) +
      (reserveLatticeKeys?.size ?? 0) +
      (ctx.quartermastersOfficeTilesByOwner.get(player.id)?.size ?? 0) +
      (ctx.granaryTilesByOwner.get(player.id)?.size ?? 0) +
      (ctx.censusHallTilesByOwner.get(player.id)?.size ?? 0);
  }
  const result: ManpowerStructureBonus = {
    garrisonHallCount,
    assemblyWorksNetworkGarrisonHallCount,
    railDepotNetworkLogisticsGuildCount,
    logisticsGuildCount,
    ancillaryDepotCount,
    populationBureauManpowerBuildingCount,
    ...(ancillaryFactoryCapacityBonusByTown.size > 0 ? { ancillaryFactoryCapacityBonusByTown } : {})
  };
  ctx.manpowerStructureBonusCacheByPlayer.set(player.id, result);
  return result;
};
