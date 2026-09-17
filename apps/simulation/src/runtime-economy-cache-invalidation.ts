// Derived per-player economy cache invalidation on tile change -- extracted
// out of runtime-tile-index-maintenance.ts (already over the repo's per-file
// line cap) as its own cohesive unit: which tile mutations must drop or
// dirty which player-level caches. The ownership/structure/anchor INDEX
// maintenance stays in runtime-tile-index-maintenance.ts.
import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "./runtime-types.js";
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
/**
 * True when `previous` -> `next` changed any field the per-player derived
 * caches (economy snapshot, tile-yield context, town network, defensibility,
 * resource slots, manpower structure bonus, upkeep accrual) actually read.
 * Sub-objects are compared by reference: the runtime only ever replaces
 * them (`{ ...tile, town: { ...town, ... } }`), never mutates in place.
 */
export const economyRelevantTileFieldsChanged = (previous: DomainTileState, next: DomainTileState): boolean =>
  previous.ownerId !== next.ownerId ||
  previous.ownershipState !== next.ownershipState ||
  previous.terrain !== next.terrain ||
  previous.resource !== next.resource ||
  previous.dockId !== next.dockId ||
  previous.waystation !== next.waystation ||
  previous.town !== next.town ||
  previous.fort !== next.fort ||
  previous.observatory !== next.observatory ||
  previous.siegeOutpost !== next.siegeOutpost ||
  previous.economicStructure !== next.economicStructure ||
  previous.sabotage !== next.sabotage ||
  previous.naturalWonder !== next.naturalWonder;

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
  // A write that only touched fields none of these caches read (muster
  // flags, frontier-decay / heal / breach-shock stamps, shard sites,
  // watchtowers) must not invalidate anything: every SET_MUSTER and every
  // muster auto-fire tick used to drop the owner's economy, defensibility,
  // resource-slot and manpower caches and the very next emitPlayerStateUpdate
  // rebuilt them all from scratch — for no change in any input. Tiles are
  // replaced immutably (never mutated in place), so reference inequality on
  // the sub-objects is an exact "did it change" test.
  if (previous && !economyRelevantTileFieldsChanged(previous, next)) return;

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
