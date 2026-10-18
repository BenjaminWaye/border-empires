import type { DomainTileState } from "@border-empires/game-domain";

import type { ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import type { TownConnectivityState } from "../economy-network/town-connectivity-incremental.js";
import type { PlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import type { PlayerUpdateEconomySnapshot } from "../player-update-economy/player-update-economy.js";
import type { UpkeepAccrualSnapshot } from "../player-upkeep-incremental/player-upkeep-incremental.js";
import type { ResourceSlotDormancy, ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { refreshEconomyCachesForTileChange } from "../runtime-economy-cache-invalidation.js";
import { AI_DERIVED_CACHE_COALESCE_MS } from "../runtime/runtime-economy.js";
import type { ManpowerStructureBonus } from "../runtime-manpower-structure-bonus.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "../runtime-types.js";

/** What the caches read from the simulation runtime. */
export interface RuntimeEconomyCachesDeps {
  beforeDockPartnerChange?: (playerId: string) => void;
  dockPartnerOwners?: (tileKey: string) => Iterable<string>;
  now(): number;
  isAiPlayer(playerId: string): boolean;
}

/**
 * The simulation's derived per-player economy caches (economy snapshot,
 * upkeep, tile-yield context, town network, manpower structure bonus,
 * defensibility, resource-slot supply/demand/dormancy) and their AI-only
 * dirty-coalescing bookkeeping. None of it is persisted: every entry is
 * rebuilt from tiles and players on a miss. Invalidation on tile writes lives
 * in runtime-economy-cache-invalidation.ts; the rebuilds live in
 * runtime-economy.ts and resource-slot-view.ts.
 */
export class RuntimeEconomyCaches {
  // Cached economy snapshot per player. Invalidated in replaceTileState on any
  // income/upkeep-relevant tile mutation; keyed by player ID, missing = dirty.
  readonly economySnapshotCacheByPlayer = new Map<string, PlayerUpdateEconomySnapshot>();
  // Incremental upkeep cache: unlike economySnapshotCacheByPlayer (invalidate +
  // O(tiles) rebuild), kept warm via O(1) add/subtract in replaceTileState.
  // Lazily populated on first read; invalidated when tech/domain mults change.
  readonly upkeepAccrualCacheByPlayer = new Map<string, UpkeepAccrualSnapshot>();
  // Per-player read counter for the upkeep cache. Drives the periodic full
  // rebuild that bounds floating-point drift (see cachedUpkeepAccrual).
  readonly upkeepAccrualReadCountByPlayer = new Map<string, number>();
  // Cached tile-yield economy context per player. Includes town network, fed-town
  // keys, and first-three-town keys. Invalidated alongside economySnapshotCacheByPlayer
  // (same replaceTileState triggers). Used by tileDeltaFromState and
  // applyPassiveIncome to avoid rebuilding the town network from all settled tiles.
  readonly tileYieldContextCacheByPlayer = new Map<string, RuntimeTileYieldEconomyContext>();
  // Shared town-network cache: buildConnectedTownNetworkForPlayer is O(settled
  // tiles + towns^2) and was being built TWICE per cache-miss cycle (once here,
  // once inside buildPlayerUpdateEconomySnapshot). Sharing cuts that in half.
  readonly townNetworkCacheByPlayer = new Map<string, Map<string, ConnectedTownNetworkEntry>>();
  // Incremental union-find backing buildConnectedTownNetworkForPlayer's fast
  // path (see town-connectivity-incremental.ts) — maintained per-player by
  // refreshEconomyCachesForTileChange on every tile mutation, so a
  // townNetworkCacheByPlayer cache-miss can usually resolve via O(towns)
  // union-find lookups instead of a full O(settled tiles) BFS.
  readonly townConnectivityStateByPlayer = new Map<string, TownConnectivityState>();
  // §4.4 manpower structure bonuses (Ancillary Depot flat cap + Neural Works
  // network cap/regen) — invalidated alongside townNetworkCacheByPlayer since
  // it's derived from that same network plus a Ancillary Depot/Neural Works scan.
  readonly manpowerStructureBonusCacheByPlayer = new Map<string, ManpowerStructureBonus>();
  // Defensibility metrics cache; invalidated alongside economy snapshot (same
  // tile mutations change income and border exposure T/E/Ts/Es).
  readonly defensibilityMetricsCacheByPlayer = new Map<string, PlayerDefensibilityMetrics>();
  // §5 (resource slots) supply/demand caches. emitPlayerStateUpdate calls
  // these on every command AND on the periodic income tick (runtime-passive-
  // income.ts) for every player, so an uncached O(territory) rescan here
  // would be a real per-tick cost at scale, unlike hasFreeResourceSlots'
  // once-per-build call. Invalidation gates: see
  // refreshEconomyCachesForTileChange.
  readonly resourceSlotSupplyCacheByPlayer = new Map<string, ResourceSlotTotals>();
  readonly resourceSlotDemandCacheByPlayer = new Map<string, ResourceSlotTotals>();
  // §5.4 dormancy: derived from both supply and demand, so it must be
  // invalidated on the union of their triggers — piggybacks on the demand
  // cache's unconditional (not SETTLED-gated) invalidation.
  readonly resourceSlotDormancyCacheByPlayer = new Map<string, ResourceSlotDormancy>();
  // AI-only rebuild coalescing (2026-07-29 login-stall investigation): AI
  // players settle/expand continuously with no live subscriber, so a
  // continuous-settling AI empire was paying a fresh O(settled-tiles)
  // economy/defensibility rebuild on nearly every command. These track "needs
  // a rebuild eventually" + "when did we last actually rebuild" so a dirty AI
  // player's cache is served as-is (slightly stale) for up to
  // AI_DERIVED_CACHE_COALESCE_MS before the next read pays the real rebuild
  // cost, instead of on literally every mutation. Human players never touch
  // these — see refreshEconomyCachesForTileChange, which still deletes their
  // cache entries immediately so a human's own action is reflected instantly.
  readonly economySnapshotDirtyPlayerIds = new Set<string>();
  readonly economySnapshotLastRebuiltAtMsByPlayer = new Map<string, number>();
  readonly defensibilityMetricsDirtyPlayerIds = new Set<string>();
  readonly defensibilityMetricsLastRebuiltAtMsByPlayer = new Map<string, number>();
  private readonly resourceSlotSupplyDirtyPlayerIds = new Set<string>();
  private readonly resourceSlotSupplyLastRebuiltAtMsByPlayer = new Map<string, number>();
  private readonly resourceSlotDemandDirtyPlayerIds = new Set<string>();
  private readonly resourceSlotDemandLastRebuiltAtMsByPlayer = new Map<string, number>();
  private readonly resourceSlotDormancyDirtyPlayerIds = new Set<string>();
  private readonly resourceSlotDormancyLastRebuiltAtMsByPlayer = new Map<string, number>();

  constructor(private readonly deps: RuntimeEconomyCachesDeps) {}

  /** Drop or dirty every cache a tile write can affect; see refreshEconomyCachesForTileChange. */
  refreshForTileChange(tileKey: string, previous: DomainTileState | undefined, next: DomainTileState, players: ReadonlyMap<string, RuntimePlayer>): void {
    if ((previous?.dockId || next.dockId) && (previous?.ownerId !== next.ownerId || previous?.ownershipState !== next.ownershipState)) {
      for (const id of new Set(this.deps.dockPartnerOwners?.(tileKey) ?? [])) { this.deps.beforeDockPartnerChange?.(id); this.invalidateEconomySnapshot(id); this.tileYieldContextCacheByPlayer.delete(id); }
    }
    refreshEconomyCachesForTileChange({
      tileKey,
      previous,
      next,
      players,
      economySnapshotCacheByPlayer: this.economySnapshotCacheByPlayer,
      tileYieldContextCacheByPlayer: this.tileYieldContextCacheByPlayer,
      townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
      townConnectivityStateByPlayer: this.townConnectivityStateByPlayer,
      defensibilityMetricsCacheByPlayer: this.defensibilityMetricsCacheByPlayer,
      upkeepAccrualCacheByPlayer: this.upkeepAccrualCacheByPlayer,
      manpowerStructureBonusCacheByPlayer: this.manpowerStructureBonusCacheByPlayer,
      resourceSlotSupplyCacheByPlayer: this.resourceSlotSupplyCacheByPlayer,
      resourceSlotDemandCacheByPlayer: this.resourceSlotDemandCacheByPlayer,
      resourceSlotDormancyCacheByPlayer: this.resourceSlotDormancyCacheByPlayer,
      economySnapshotDirtyPlayerIds: this.economySnapshotDirtyPlayerIds,
      defensibilityMetricsDirtyPlayerIds: this.defensibilityMetricsDirtyPlayerIds,
      resourceSlotSupplyDirtyPlayerIds: this.resourceSlotSupplyDirtyPlayerIds,
      resourceSlotDemandDirtyPlayerIds: this.resourceSlotDemandDirtyPlayerIds,
      resourceSlotDormancyDirtyPlayerIds: this.resourceSlotDormancyDirtyPlayerIds
    });
  }

  /** Drop a player's economy snapshot and tile-yield context (e.g. a town grew). */
  invalidateEconomySnapshot(playerId: string): void {
    this.economySnapshotCacheByPlayer.delete(playerId);
    this.tileYieldContextCacheByPlayer.delete(playerId);
  }

  /** Drop every town network and connectivity state, for a full rebuild from tiles. */
  clearTownNetworks(): void {
    this.townNetworkCacheByPlayer.clear();
    this.townConnectivityStateByPlayer.clear();
  }

  // forceFresh bypasses the AI coalescing window (build gates must see current slots).
  resourceSlotSupply(playerId: string, forceFresh: boolean, rebuild: () => ResourceSlotTotals): ResourceSlotTotals {
    return this.coalescedRead(this.resourceSlotSupplyCacheByPlayer, this.resourceSlotSupplyDirtyPlayerIds, this.resourceSlotSupplyLastRebuiltAtMsByPlayer, playerId, forceFresh, rebuild);
  }

  resourceSlotDemand(playerId: string, forceFresh: boolean, rebuild: () => ResourceSlotTotals): ResourceSlotTotals {
    return this.coalescedRead(this.resourceSlotDemandCacheByPlayer, this.resourceSlotDemandDirtyPlayerIds, this.resourceSlotDemandLastRebuiltAtMsByPlayer, playerId, forceFresh, rebuild);
  }

  // No build-gate consumer, so dormancy always coalesces for AI.
  resourceSlotDormancy(playerId: string, rebuild: () => ResourceSlotDormancy): ResourceSlotDormancy {
    return this.coalescedRead(this.resourceSlotDormancyCacheByPlayer, this.resourceSlotDormancyDirtyPlayerIds, this.resourceSlotDormancyLastRebuiltAtMsByPlayer, playerId, false, rebuild);
  }

  // Same dirty + coalesce shape as cachedEconomySnapshot: a clean entry is
  // served as-is, and a dirty AI entry is too while it's younger than
  // AI_DERIVED_CACHE_COALESCE_MS.
  private coalescedRead<V>(cache: Map<string, V>, dirty: Set<string>, lastRebuiltAt: Map<string, number>, playerId: string, forceFresh: boolean, rebuild: () => V): V {
    const cached = cache.get(playerId);
    if (
      cached &&
      !forceFresh &&
      (!dirty.has(playerId) || (this.deps.isAiPlayer(playerId) && this.deps.now() - (lastRebuiltAt.get(playerId) ?? 0) < AI_DERIVED_CACHE_COALESCE_MS))
    ) {
      return cached;
    }
    const result = rebuild();
    cache.set(playerId, result);
    dirty.delete(playerId);
    lastRebuiltAt.set(playerId, this.deps.now());
    return result;
  }
}
