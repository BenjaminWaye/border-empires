import { afcEnvoyBenefits, applyAfcEnvoyIncome } from "../afc-specializations/afc-coalition.js";
// Runtime economy caches use explicit context dependencies. Domestic income
// stays cached independently of allied Envoy contributions; manpower formulas
// and settlement live in runtime-manpower-economy.ts and are re-exported here.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "../runtime-types.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { buildPlayerDefensibilityMetrics, type PlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import { buildPlayerUpdateEconomySnapshot, type PlayerUpdateEconomySnapshot } from "../player-update-economy/player-update-economy.js";
import { buildUpkeepAccrualSnapshot, type UpkeepAccrualSnapshot } from "../player-upkeep-incremental/player-upkeep-incremental.js";
import { EMPIRE_INTEGRITY_ENABLED, empireIntegrity, integrityEconomyMult } from "@border-empires/shared";
import type { ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";
import { computeEmpireStorageCap, type EmpireStorageCap } from "../runtime-empire-storage.js";

// Every UPKEEP_ACCRUAL_REBUILD_INTERVAL reads we force a full upkeep-accrual
// rebuild to bound floating-point drift from the running add/subtract sum
// over a long-lived season (see cachedUpkeepAccrual).
const UPKEEP_ACCRUAL_REBUILD_INTERVAL = 256;
// Coalescing window for AI-only derived caches (economy snapshot,
// defensibility metrics) — see cachedEconomySnapshot/cachedDefensibilityMetrics.
// Exported so runtime.ts's own AI-derived caches (planner world view, etc.)
// share one definition instead of drifting independently.
export const AI_DERIVED_CACHE_COALESCE_MS = 5_000;

export {
  type RuntimeManpowerEconomyContext, playerManpowerCap, playerManpowerRegenPerMinute,
  playerLogisticsThroughputPerMinute, playerManpowerBreakdown, effectiveManpowerAtForPlayer,
  applyManpowerRegenForPlayer, refreshManpowerOnlyForPlayer
} from "./runtime-manpower-economy.js";

export interface RuntimeEconomyCacheContext {
  now: () => number;
  tiles: Map<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  players: Map<string, RuntimePlayer>;
  economySnapshotCacheByPlayer: Map<string, PlayerUpdateEconomySnapshot>;
  economySnapshotDirtyPlayerIds: Set<string>;
  economySnapshotLastRebuiltAtMsByPlayer: Map<string, number>;
  defensibilityMetricsCacheByPlayer: Map<string, PlayerDefensibilityMetrics>;
  defensibilityMetricsDirtyPlayerIds: Set<string>;
  defensibilityMetricsLastRebuiltAtMsByPlayer: Map<string, number>;
  upkeepAccrualReadCountByPlayer: Map<string, number>;
  upkeepAccrualCacheByPlayer: Map<string, UpkeepAccrualSnapshot>;
  settledTilesForPlayer: (playerId: string) => DomainTileState[];
  cachedTownNetworkForPlayer: (
    player: DomainPlayer,
    settledTiles: readonly DomainTileState[],
    maxConnectedTownNames: number
  ) => Map<string, ConnectedTownNetworkEntry>;
  foodDormantTownKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  dormantEconomicStructureKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  trackSyncMainThreadTask?: MainThreadTaskTracker["trackSync"];
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
}

/**
 * Returns a cached PlayerUpdateEconomySnapshot for the player, rebuilding it
 * only when the cache has been invalidated (i.e., a tile affecting this
 * player's income changed via replaceTileState).
 *
 * The snapshot is built with full dock context so both the accrual path and
 * the emit path share a single entry. The dock context affects only
 * `incomePerMinute` (display), not the upkeep rates consumed by accrual math,
 * so this is safe for all callers.
 *
 * Cache miss cost: O(settled tiles). Cache hit cost: O(1).
 * Invalidated on every replaceTileState — O(1) per mutation.
 */
function cachedBaseEconomySnapshot(
  ctx: RuntimeEconomyCacheContext,
  player: RuntimePlayer
): PlayerUpdateEconomySnapshot {
  const cached = ctx.economySnapshotCacheByPlayer.get(player.id);
  if (cached) {
    const dirty = ctx.economySnapshotDirtyPlayerIds.has(player.id);
    if (!dirty) return cached;
    if (player.isAi) {
      const lastRebuiltAt = ctx.economySnapshotLastRebuiltAtMsByPlayer.get(player.id) ?? 0;
      if (ctx.now() - lastRebuiltAt < AI_DERIVED_CACHE_COALESCE_MS) return cached;
    }
  }
  const rebuild = (): PlayerUpdateEconomySnapshot => {
    const summary = ctx.summaryForPlayer(player.id);
    let econMult = 1;
    if (EMPIRE_INTEGRITY_ENABLED) {
      // Read from the defensibility cache without triggering a rebuild here —
      // emitPlayerStateUpdate always calls cachedDefensibilityMetrics() before
      // cachedEconomySnapshot(), so the cache is warm on the normal command path.
      // Callers outside emitPlayerStateUpdate (login snapshot, passive income)
      // get econMult=1 when the cache is cold, which is acceptable because
      // emitPlayerStateUpdate will emit the corrected value in the same tick.
      const metrics = ctx.defensibilityMetricsCacheByPlayer.get(player.id);
      if (metrics) {
        econMult = integrityEconomyMult(empireIntegrity(metrics.Ts, metrics.Es));
      }
    }
    const settledTiles = ctx.settledTilesForPlayer(player.id);
    const townNetwork = ctx.cachedTownNetworkForPlayer(player, settledTiles, 0);
    const snapshot = buildPlayerUpdateEconomySnapshot(
      player,
      summary,
      ctx.tiles,
      { dockLinksByDockTileKey: ctx.dockLinksByDockTileKey, players: ctx.players },
      econMult,
      townNetwork,
      ctx.foodDormantTownKeysForPlayer(player.id),
      ctx.dormantEconomicStructureKeysForPlayer(player.id),
      ctx.now()
    );
    ctx.economySnapshotCacheByPlayer.set(player.id, snapshot);
    ctx.economySnapshotDirtyPlayerIds.delete(player.id);
    ctx.economySnapshotLastRebuiltAtMsByPlayer.set(player.id, ctx.now());
    return snapshot;
  };
  // Attribution for event_loop_blocked (was empty mainThreadTasks): scales
  // with settled/owned tile count; hit from passive income + command handlers.
  return ctx.trackSyncMainThreadTask
    ? ctx.trackSyncMainThreadTask("cached_economy_snapshot_rebuild", { playerId: player.id }, rebuild)
    : rebuild();
}

/** Refresh alliance-derived income on cache hits too, without recursively reading an ally's bonuses. */
export function cachedEconomySnapshot(ctx: RuntimeEconomyCacheContext, player: RuntimePlayer): PlayerUpdateEconomySnapshot {
  const base = cachedBaseEconomySnapshot(ctx, player);
  const benefits = afcEnvoyBenefits(player, ctx.players, ally => ({
    goldPerMinute: cachedBaseEconomySnapshot(ctx, ally).incomePerMinute,
    manpowerCap: 0, manpowerRegenPerMinute: 0
  }));
  if (benefits.goldPerMinute <= 0) return base;
  return applyAfcEnvoyIncome({ ...base, economyBreakdown: { ...base.economyBreakdown,
    GOLD: { ...base.economyBreakdown.GOLD, sources: [...base.economyBreakdown.GOLD.sources] }
  } }, benefits);
}

/**
 * Returns the incremental upkeep accrual snapshot for `player`.
 * Cache hit: O(1). Cache miss (first access or after tech/domain change): O(settled tiles).
 * Kept warm by replaceTileState O(1) add/subtract on every tile mutation.
 *
 * Every UPKEEP_ACCRUAL_REBUILD_INTERVAL reads we force a full rebuild to bound
 * floating-point drift from the running add/subtract sum over a long-lived
 * season. Drift per op is ~1e-16 relative, so this is defense-in-depth; the
 * interval keeps the periodic O(settled-tiles) rebuild rare.
 */
export function cachedUpkeepAccrual(
  ctx: RuntimeEconomyCacheContext,
  player: RuntimePlayer
): UpkeepAccrualSnapshot {
  const reads = (ctx.upkeepAccrualReadCountByPlayer.get(player.id) ?? 0) + 1;
  ctx.upkeepAccrualReadCountByPlayer.set(player.id, reads);
  if (reads % UPKEEP_ACCRUAL_REBUILD_INTERVAL === 0) {
    ctx.upkeepAccrualCacheByPlayer.delete(player.id);
  }
  const cached = ctx.upkeepAccrualCacheByPlayer.get(player.id);
  if (cached) return cached;
  const snapshot = buildUpkeepAccrualSnapshot(player.id, player, ctx.tiles);
  ctx.upkeepAccrualCacheByPlayer.set(player.id, snapshot);
  return snapshot;
}

export function cachedDefensibilityMetrics(
  ctx: RuntimeEconomyCacheContext,
  playerId: string,
  summary: PlayerRuntimeSummary
): PlayerDefensibilityMetrics {
  const cached = ctx.defensibilityMetricsCacheByPlayer.get(playerId);
  if (cached) {
    const dirty = ctx.defensibilityMetricsDirtyPlayerIds.has(playerId);
    if (!dirty) return cached;
    if (ctx.players.get(playerId)?.isAi) {
      const lastRebuiltAt = ctx.defensibilityMetricsLastRebuiltAtMsByPlayer.get(playerId) ?? 0;
      if (ctx.now() - lastRebuiltAt < AI_DERIVED_CACHE_COALESCE_MS) return cached;
    }
  }
  // Instrumentation only (2026-07-28/29 login-stall investigation): this
  // rebuild was previously untracked, so a cache-miss here was invisible in
  // event_loop_blocked's mainThreadTasks — its cost got silently absorbed
  // into whichever outer phase (emitPlayerStateUpdate /
  // apply_passive_income_for_player) happened to trigger it. A 3.9s single
  // call was observed post-fix; buildPlayerDefensibilityMetrics is O(owned
  // tiles x 4-neighbor-scan), which should be well under a second even for
  // 10k+ tiles, so log the real owned-tile count directly (trackSync's
  // "details" field gets truncated to "[Object]" in the pretty-printed fly
  // logs) whenever this is suspiciously slow.
  const rebuildStartedAt = ctx.now();
  // Skip the T/E all-owned pass for AI: nothing ever reads T/E for a
  // player nobody is subscribed to (see buildPlayerDefensibilityMetrics'
  // doc comment) — only Ts/Es (settled-only) feeds real gameplay math.
  const skipAllOwnedStats = ctx.players.get(playerId)?.isAi === true;
  const rebuild = (): PlayerDefensibilityMetrics =>
    buildPlayerDefensibilityMetrics(playerId, ctx.tiles, summary.territoryTileKeys, skipAllOwnedStats);
  const metrics = ctx.trackSyncMainThreadTask
    ? ctx.trackSyncMainThreadTask("defensibility_metrics_rebuild", { playerId }, rebuild)
    : rebuild();
  const rebuildDurationMs = ctx.now() - rebuildStartedAt;
  if (rebuildDurationMs > 500) {
    ctx.runtimeLogInfo(
      { playerId, ownedTileCount: summary.territoryTileKeys.size, durationMs: rebuildDurationMs },
      "[defensibility_metrics_rebuild] slow call detail"
    );
  }
  ctx.defensibilityMetricsCacheByPlayer.set(playerId, metrics);
  ctx.defensibilityMetricsDirtyPlayerIds.delete(playerId);
  ctx.defensibilityMetricsLastRebuiltAtMsByPlayer.set(playerId, ctx.now());
  return metrics;
}

export interface RuntimeIncomeStorageContext {
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  respawnPlayerOnUnownedLand: (playerId: string, commandId: string) => boolean;
}

export function incomePerMinuteForPlayer(ctx: RuntimeIncomeStorageContext, playerId: string): number {
  const player = ctx.players.get(playerId);
  if (!player) return 0;
  // Route through cachedEconomySnapshot — the cache is maintained
  // incrementally by replaceTileState (O(1) per tile mutation) so this
  // returns a stale-free result without rebuilding the full O(settled-tiles)
  // snapshot on every call. The full rebuild only fires on cache miss.
  return ctx.cachedEconomySnapshot(player).incomePerMinute;
}

export function hasActiveSettlementTownForPlayer(ctx: RuntimeIncomeStorageContext, playerId: string): boolean {
  for (const tileKey of ctx.summaryForPlayer(playerId).ownedTownTierByTile.keys()) {
    const tile = ctx.tiles.get(tileKey);
    if (
      tile?.ownerId === playerId &&
      tile.ownershipState === "SETTLED" &&
      tile.town?.populationTier === "SETTLEMENT"
    ) {
      return true;
    }
  }
  return false;
}

export function ensureGrossIncomeSettlementForPlayer(
  ctx: RuntimeIncomeStorageContext,
  playerId: string,
  commandId: string
): boolean {
  const player = ctx.players.get(playerId);
  if (!player || player.id.startsWith("barbarian-")) return false;
  const summary = ctx.summaryForPlayer(playerId);
  if (summary.territoryTileKeys.size === 0) return false;
  // No AFC (its flat Coin baseline is what usually lapses here): a human
  // rebuilds it for free, an AI gets one placed after a delay
  // (runtime-respawn-helpers.ts). Don't drop a fresh AFC on neutral land.
  if (summary.ownedAfcTileKeys.size === 0) return false;
  if (hasActiveSettlementTownForPlayer(ctx, playerId)) return false;
  if (incomePerMinuteForPlayer(ctx, playerId) > 0) return false;
  return ctx.respawnPlayerOnUnownedLand(playerId, commandId);
}

export function estimatedIncomePerMinuteForPlayer(ctx: RuntimeIncomeStorageContext, playerId: string): number {
  const player = ctx.players.get(playerId);
  const incomeMult = player?.mods?.income ?? 1;
  return Math.round(ctx.summaryForPlayer(playerId).goldIncomePerMinute * incomeMult * 1e6) / 1e6; // was 2dp; rounded most income to 0.00 post-rescale (§24.4)
}

export function storageCapForPlayer(ctx: RuntimeIncomeStorageContext, playerId: string): EmpireStorageCap | undefined {
  const player = ctx.players.get(playerId);
  if (!player) return undefined;
  const summary = ctx.summaryForPlayer(playerId);
  const economy = ctx.cachedEconomySnapshot(player);
  return computeEmpireStorageCap(summary, economy.strategicProductionPerMinute);
}
