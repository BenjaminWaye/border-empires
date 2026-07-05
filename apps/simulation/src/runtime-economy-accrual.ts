import type { ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { buildTileYieldView } from "./tile-yield-view/tile-yield-view.js";
import { buildPlayerUpdateEconomySnapshot, refreshTownEconomyFields, type PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import { buildUpkeepAccrualSnapshot, type UpkeepAccrualSnapshot } from "./player-upkeep-incremental/player-upkeep-incremental.js";
import { buildPlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";
import { enrichTownWithConnectedNetwork } from "./economy-network/economy-network.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import {
  effectiveManpowerAt,
  playerManpowerBreakdownFromSummary,
  playerManpowerCapFromSummary,
  playerManpowerRegenPerMinuteFromSummary
} from "./runtime-manpower.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext, UpkeepNeed } from "./runtime-types.js";
import { UPKEEP_STRATEGIC_KEYS, hasOutstandingUpkeepNeed } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimeReplayCache } from "./runtime-replay-cache.js";

const UPKEEP_ACCRUAL_REBUILD_INTERVAL = 100;

export type RuntimeEconomyAccrualContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  economySnapshotCacheByPlayer: Map<string, PlayerUpdateEconomySnapshot>;
  upkeepAccrualCacheByPlayer: Map<string, UpkeepAccrualSnapshot>;
  upkeepAccrualReadCountByPlayer: Map<string, number>;
  defensibilityMetricsCacheByPlayer: Map<string, { T: number; E: number; Ts: number; Es: number }>;
  lastEconomyAccrualAtByPlayer: Map<string, number>;
  playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>;
  yieldBearingTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  sortedYieldBearingKeysByOwner: Map<string, string[]>;
  tileYieldCollectedAtByTile: Map<string, number>;
  replayCache: RuntimeReplayCache;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  tileYieldEconomyContextForPlayer: (player: DomainPlayer) => RuntimeTileYieldEconomyContext;
  tileYieldCollectedAt: (tileKey: string, ownerId?: string) => number | undefined;
  emitEvent: (event: SimulationEvent) => void;
};

export const playerManpowerCap = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer): number =>
  player.id === "barbarian-1" ? Number.MAX_SAFE_INTEGER : playerManpowerCapFromSummary(ctx.summaryForPlayer(player.id));

export const playerManpowerRegenPerMinute = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer): number =>
  playerManpowerRegenPerMinuteFromSummary(ctx.summaryForPlayer(player.id));

export const playerManpowerBreakdown = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer): ManpowerBreakdown =>
  playerManpowerBreakdownFromSummary(ctx.summaryForPlayer(player.id));

export const effectiveRuntimeManpowerAt = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer, nowMs: number): number =>
  effectiveManpowerAt(player, playerManpowerCap(ctx, player), playerManpowerRegenPerMinute(ctx, player), nowMs);

export const applyManpowerRegen = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer, nowMs: number): void => {
  applyEconomyAccrual(ctx, player, nowMs);
  refreshManpowerOnly(ctx, player, nowMs);
};

export const refreshManpowerOnly = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer, nowMs: number): void => {
  const cap = playerManpowerCap(ctx, player);
  if (!Number.isFinite(player.manpower)) {
    player.manpower = cap;
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
  if (cap > previousCap) player.manpower = Math.min(cap, Math.max(0, player.manpower) + (cap - previousCap));
  if (!Number.isFinite(player.manpowerUpdatedAt)) {
    player.manpower = Math.max(0, Math.min(cap, player.manpower));
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  player.manpower = effectiveRuntimeManpowerAt(ctx, player, nowMs);
  player.manpowerUpdatedAt = nowMs;
  player.manpowerCapSnapshot = cap;
};

export const cachedEconomySnapshot = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer): PlayerUpdateEconomySnapshot => {
  const cached = ctx.economySnapshotCacheByPlayer.get(player.id);
  if (cached) return cached;
  const snapshot = buildPlayerUpdateEconomySnapshot(player, ctx.summaryForPlayer(player.id), ctx.tiles, {
    dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
  });
  ctx.economySnapshotCacheByPlayer.set(player.id, snapshot);
  return snapshot;
};

export const cachedUpkeepAccrual = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer): UpkeepAccrualSnapshot => {
  const reads = (ctx.upkeepAccrualReadCountByPlayer.get(player.id) ?? 0) + 1;
  ctx.upkeepAccrualReadCountByPlayer.set(player.id, reads);
  if (reads % UPKEEP_ACCRUAL_REBUILD_INTERVAL === 0) ctx.upkeepAccrualCacheByPlayer.delete(player.id);
  const cached = ctx.upkeepAccrualCacheByPlayer.get(player.id);
  if (cached) return cached;
  const snapshot = buildUpkeepAccrualSnapshot(player.id, player, ctx.tiles);
  ctx.upkeepAccrualCacheByPlayer.set(player.id, snapshot);
  return snapshot;
};

export const cachedDefensibilityMetrics = (
  ctx: RuntimeEconomyAccrualContext,
  playerId: string,
  summary: PlayerRuntimeSummary
): { T: number; E: number; Ts: number; Es: number } => {
  const cached = ctx.defensibilityMetricsCacheByPlayer.get(playerId);
  if (cached) return cached;
  const metrics = buildPlayerDefensibilityMetrics(playerId, ctx.tiles, summary.territoryTileKeys);
  ctx.defensibilityMetricsCacheByPlayer.set(playerId, metrics);
  return metrics;
};

export const applyEconomyAccrual = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer, nowMs: number): void => {
  const last = ctx.lastEconomyAccrualAtByPlayer.get(player.id);
  if (last === undefined) {
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
    return;
  }
  const elapsedMs = nowMs - last;
  if (elapsedMs <= 0) return;
  if (!ctx.playerSummaries.has(player.id)) {
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
    return;
  }
  const upkeep = cachedUpkeepAccrual(ctx, player);
  if (process.env["DEV_ASSERT_ECONOMY_INCREMENTAL"] === "1") assertIncrementalUpkeep(ctx, player, upkeep);
  const summary = ctx.summaryForPlayer(player.id);
  const elapsedMinutes = elapsedMs / 60_000;
  const trickle = chosenTrickleRateForPlayer(player);
  if (trickle && trickle.ratePerMinute > 0) {
    const credit = trickle.ratePerMinute * elapsedMinutes;
    if (credit > 0) {
      const current = player.strategicResources ?? {};
      player.strategicResources = { ...current, [trickle.resource]: (current[trickle.resource] ?? 0) + credit };
    }
  }
  const need: UpkeepNeed = {
    gold: Math.max(0, upkeep.gold) * elapsedMinutes,
    FOOD: Math.max(0, upkeep.food) * elapsedMinutes,
    IRON: Math.max(0, upkeep.iron) * elapsedMinutes,
    CRYSTAL: Math.max(0, upkeep.crystal) * elapsedMinutes,
    SUPPLY: Math.max(0, upkeep.supply) * elapsedMinutes
  };
  consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);
  if (need.gold > 0) player.points = Math.max(0, (player.points ?? 0) - need.gold);
  const stock = {
    FOOD: player.strategicResources?.FOOD ?? 0,
    IRON: player.strategicResources?.IRON ?? 0,
    CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
    SUPPLY: player.strategicResources?.SUPPLY ?? 0,
    SHARD: player.strategicResources?.SHARD ?? 0
  };
  let mutated = false;
  for (const resource of UPKEEP_STRATEGIC_KEYS) {
    if (need[resource] > 0) {
      stock[resource] = Math.max(0, stock[resource] - need[resource]);
      mutated = true;
    }
  }
  if (mutated) player.strategicResources = stock;
  ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
};

const assertIncrementalUpkeep = (ctx: RuntimeEconomyAccrualContext, player: RuntimePlayer, upkeep: UpkeepAccrualSnapshot): void => {
  const full = buildPlayerUpdateEconomySnapshot(player, ctx.summaryForPlayer(player.id), ctx.tiles, {
    dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
  });
  const round4 = (n: number): number => Number(n.toFixed(4));
  const mismatches: string[] = [];
  for (const key of ["gold", "food", "iron", "crystal", "supply"] as const) {
    const inc = round4(upkeep[key]);
    const fullV = round4((full.upkeepPerMinute as Record<string, number | undefined>)[key] ?? 0);
    if (inc !== fullV) mismatches.push(`${key}: incremental=${inc} full=${fullV}`);
  }
  if (mismatches.length > 0) console.error(`[DEV_ASSERT_ECONOMY_INCREMENTAL] player=${player.id} mismatch: ${mismatches.join(", ")}`);
};

const consumeUpkeepFromTileYield = (
  ctx: RuntimeEconomyAccrualContext,
  player: RuntimePlayer,
  summary: PlayerRuntimeSummary,
  need: UpkeepNeed,
  nowMs: number
): void => {
  if (!hasOutstandingUpkeepNeed(need)) return;
  if (summary.territoryTileKeys.size <= 0) return;
  let economyContext: RuntimeTileYieldEconomyContext | undefined;
  const yieldBearingSet = ctx.yieldBearingTilesByOwner.get(player.id);
  let tileKeys: readonly string[];
  if (!yieldBearingSet || yieldBearingSet.size === 0) {
    tileKeys = [];
  } else {
    let cached = ctx.sortedYieldBearingKeysByOwner.get(player.id);
    if (!cached) {
      cached = [...yieldBearingSet].sort();
      ctx.sortedYieldBearingKeysByOwner.set(player.id, cached);
    }
    tileKeys = cached;
  }
  const syntheticCommandId = `accrual:upkeep:${player.id}:${nowMs}`;
  const batchedAnchors: Array<{ tileKey: string; collectedAt: number }> = [];
  for (const tileKey of tileKeys) {
    if (!hasOutstandingUpkeepNeed(need)) return;
    const tile = ctx.tiles.get(tileKey);
    if (!tile || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!economyContext) economyContext = ctx.tileYieldEconomyContextForPlayer(player);
    const enrichedTile = tile.town
      ? (() => {
          const networkTown = enrichTownWithConnectedNetwork(tile, economyContext!.townNetwork);
          const refreshedTown = networkTown
            ? refreshTownEconomyFields(networkTown, tile, player, ctx.tiles, economyContext!.fedTownKeys, economyContext!.firstThreeTownKeys, economyContext!.townNetwork?.get(tileKey)?.connectedClearingHouseKeys)
            : networkTown;
          return { ...tile, town: refreshedTown };
        })()
      : tile;
    const lastCollectedAt = ctx.tileYieldCollectedAt(tileKey, player.id);
    const yieldView = buildTileYieldView(enrichedTile, lastCollectedAt, nowMs, {
      player,
      fedTownKeys: economyContext.fedTownKeys,
      firstThreeTownKeys: economyContext.firstThreeTownKeys,
      waterworksKeys: economyContext.waterworksKeys,
      tiles: ctx.tiles,
      dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
    });
    if (!yieldView?.yield) continue;
    const anchorWas = lastCollectedAt ?? 0;
    let candidateAnchorMs = anchorWas;
    const updateCandidate = (remaining: number, ratePerMs: number): void => {
      if (ratePerMs <= 0) return;
      const resourceAnchor = nowMs - remaining / ratePerMs;
      if (resourceAnchor > candidateAnchorMs) candidateAnchorMs = resourceAnchor;
    };
    const availableGold = yieldView.yield.gold ?? 0;
    if (availableGold > 0 && need.gold > 0) {
      const consumed = Math.min(availableGold, need.gold);
      need.gold -= consumed;
      updateCandidate(availableGold - consumed, yieldView.yieldRate.goldPerMinute / 60_000);
    }
    for (const resource of UPKEEP_STRATEGIC_KEYS) {
      const available = yieldView.yield.strategic[resource] ?? 0;
      if (available > 0 && need[resource] > 0) {
        const consumed = Math.min(available, need[resource]);
        need[resource] -= consumed;
        updateCandidate(available - consumed, (yieldView.yieldRate.strategicPerDay[resource] ?? 0) / (1440 * 60_000));
      }
    }
    if (candidateAnchorMs > anchorWas) {
      const collectedAt = Math.min(nowMs, candidateAnchorMs);
      ctx.tileYieldCollectedAtByTile.set(tileKey, collectedAt);
      batchedAnchors.push({ tileKey, collectedAt });
    }
  }
  if (batchedAnchors.length > 0) {
    ctx.emitEvent({ eventType: "TILE_YIELD_ANCHOR_BATCH", commandId: syntheticCommandId, playerId: player.id, anchors: batchedAnchors });
  }
  ctx.replayCache.recordedEventsByCommandId.delete(syntheticCommandId);
};
