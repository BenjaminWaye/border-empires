import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { buildTileYieldView } from "./tile-yield-view/tile-yield-view.js";
import { UPKEEP_STRATEGIC_KEYS, hasOutstandingUpkeepNeed, type RuntimePlayer, type RuntimeTileYieldEconomyContext, type UpkeepNeed } from "./runtime-types.js";
import type { UpkeepAccrualSnapshot } from "./player-upkeep-incremental/player-upkeep-incremental.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { MainThreadTaskTracker } from "./main-thread-task-tracker/main-thread-task-tracker.js";
import type { DomainTileState } from "@border-empires/game-domain";

type TrackSync = MainThreadTaskTracker["trackSync"];

export type RuntimeUpkeepAccrualContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  lastEconomyAccrualAtByPlayer: Map<string, number>;
  playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>;
  yieldBearingTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  sortedYieldBearingKeysByOwner: Map<string, string[]>;
  tileYieldCollectedAtByTile: Map<string, number>;
  cachedUpkeepAccrual: (player: RuntimePlayer) => UpkeepAccrualSnapshot;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  tileYieldEconomyContextForPlayer: (player: RuntimePlayer) => RuntimeTileYieldEconomyContext;
  enrichTileWithTownContext: (
    tile: DomainTileState,
    player: RuntimePlayer | undefined,
    context: RuntimeTileYieldEconomyContext
  ) => DomainTileState;
  tileYieldCollectedAt: (tileKey: string, ownerId?: string) => number | undefined;
  emitEvent: (event: {
    eventType: "TILE_YIELD_ANCHOR_BATCH";
    commandId: string;
    playerId: string;
    anchors: Array<{ tileKey: string; collectedAt: number }>;
  }) => void;
  forgetReplayedCommand: (commandId: string) => void;
  trackSyncMainThreadTask?: TrackSync | undefined;
};

/**
 * Drains outstanding upkeep `need` from a player's yield-bearing settled
 * tiles before the treasury/stockpile is touched — mirrors the legacy
 * server's `consumeYieldForPlayer` order so an offline player whose tile
 * income covers upkeep keeps the stockpile they logged out with.
 */
export const consumeUpkeepFromTileYield = (
  ctx: RuntimeUpkeepAccrualContext,
  player: RuntimePlayer,
  summary: PlayerRuntimeSummary,
  need: UpkeepNeed,
  nowMs: number
): void => {
  if (!hasOutstandingUpkeepNeed(need)) return;
  if (summary.territoryTileKeys.size <= 0) return;
  let economyContext: RuntimeTileYieldEconomyContext | undefined;
  // Use yield-bearing index to skip plain settled tiles that produce nothing.
  // Sort for deterministic drain order — same as the old full-territory sort.
  // The sorted array is cached (sortedYieldBearingKeysByOwner) and invalidated
  // only when the underlying set changes, avoiding O(n log n) spread+sort
  // on every tick for players whose yield-bearing set is stable.
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
  // Collect anchor updates locally and emit ONE batch event at the end of
  // the loop. Pre-batch, each updated tile fired a TILE_YIELD_ANCHOR_UPDATED
  // event → separate SQLite appendEvent each. At ~2,000 owned tiles staging
  // observed 84 pending appendEvents from a single upkeep tick, blocking
  // the main event loop for 25s+. One batch event = one appendEvent.
  const batchedAnchors: Array<{ tileKey: string; collectedAt: number }> = [];
  for (const tileKey of tileKeys) {
    if (!hasOutstandingUpkeepNeed(need)) return;
    const tile = ctx.tiles.get(tileKey);
    if (!tile || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!economyContext) economyContext = ctx.tileYieldEconomyContextForPlayer(player);
    const enrichedTile = tile.town ? ctx.enrichTileWithTownContext(tile, player, economyContext) : tile;
    const lastCollectedAt = ctx.tileYieldCollectedAt(tileKey, player.id);
    const yieldView = buildTileYieldView(enrichedTile, lastCollectedAt, nowMs, {
      player,
      fedTownKeys: economyContext.fedTownKeys,
      firstThreeTownKeys: economyContext.firstThreeTownKeys,
      waterworksKeys: economyContext.waterworksKeys,
      foundryKeys: economyContext.foundryKeys,
      tiles: ctx.tiles,
      dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
    });
    if (!yieldView?.yield) continue;
    const anchorWas = lastCollectedAt ?? 0;
    // The single per-tile anchor is shared across every resource the tile
    // produces: compute a per-resource candidate anchor from the remaining
    // buffer (newAnchor = now - remaining/rate) and pick the latest, so no
    // resource is over-credited. Trade-off: consuming one resource on a
    // mixed-yield tile drains the unconsumed resource's remaining yield too
    // (lost, not banked) — rare, and fixing it needs a snapshot-schema change.
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
        const ratePerMs = (yieldView.yieldRate.strategicPerDay[resource] ?? 0) / (1440 * 60_000);
        updateCandidate(available - consumed, ratePerMs);
      }
    }
    if (candidateAnchorMs > anchorWas) {
      const collectedAt = Math.min(nowMs, candidateAnchorMs);
      // Update the in-memory map immediately so subsequent tiles in this
      // loop see fresh anchor state. Defer the event emission until after
      // the loop so we can emit one batch event instead of N singletons.
      ctx.tileYieldCollectedAtByTile.set(tileKey, collectedAt);
      batchedAnchors.push({ tileKey, collectedAt });
    }
  }
  if (batchedAnchors.length > 0) {
    ctx.emitEvent({
      eventType: "TILE_YIELD_ANCHOR_BATCH",
      commandId: syntheticCommandId,
      playerId: player.id,
      anchors: batchedAnchors
    });
  }
  // Drop the synthetic commandId from replay cache — already durably
  // persisted via emitEvent; accrual never emits terminal events so this
  // would otherwise accumulate forever.
  ctx.forgetReplayedCommand(syntheticCommandId);
};

/**
 * Rate-limited (15s) per-player economy tick: credits Clockwork Stipend
 * trickle, drains upkeep from tile yield, then falls back to the treasury
 * and strategic stockpiles for any remainder. Sharing the 15s cadence with
 * the passive-income tick keeps drain/credit in sync.
 */
export const applyEconomyAccrual = (ctx: RuntimeUpkeepAccrualContext, player: RuntimePlayer, nowMs: number): void => {
  const last = ctx.lastEconomyAccrualAtByPlayer.get(player.id);
  if (last === undefined) {
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
    return;
  }
  const elapsedMs = nowMs - last;
  if (elapsedMs <= 0) return;
  // Rate-limit to once per 15s. consumeUpkeepFromTileYield is O(yield_bearing_tiles)
  // and was being triggered on every AI command (~1/s), causing untracked
  // 8-17s main-thread stalls. The passive income tick (also 15s) handles
  // income; upkeep drain on the same cadence keeps the two in sync.
  if (elapsedMs < 15_000) return;
  if (!ctx.playerSummaries.has(player.id)) {
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
    return;
  }
  const run = (): void => {
    // Incremental upkeep cache (O(1) via replaceTileState); NOT the full
    // cachedEconomySnapshot, which would rebuild O(settled-tiles) per mutation.
    const upkeep = ctx.cachedUpkeepAccrual(player);
    // DEV_ASSERT_ECONOMY_INCREMENTAL: on-demand cross-check against full snapshot.
    // Enable with DEV_ASSERT_ECONOMY_INCREMENTAL=1 in env; OFF by default.
    if (process.env["DEV_ASSERT_ECONOMY_INCREMENTAL"] === "1") {
      const full = buildPlayerUpdateEconomySnapshot(player, ctx.summaryForPlayer(player.id), ctx.tiles, {
        dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
      });
      // Round both sides to 4dp to match buildPlayerUpdateEconomySnapshot's
      // toFixed(4) on upkeepPerMinute — avoids false positives from raw-float
      // rounding noise below the gameplay-significant precision.
      const round4 = (n: number): number => Number(n.toFixed(4));
      const mismatches: string[] = [];
      for (const key of ["gold", "food", "iron", "crystal", "supply"] as const) {
        const inc = round4(upkeep[key]);
        const fullV = round4((full.upkeepPerMinute as Record<string, number | undefined>)[key] ?? 0);
        if (inc !== fullV) mismatches.push(`${key}: incremental=${inc} full=${fullV}`);
      }
      if (mismatches.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`[DEV_ASSERT_ECONOMY_INCREMENTAL] player=${player.id} mismatch: ${mismatches.join(", ")}`);
      }
    }
    const summary = ctx.summaryForPlayer(player.id);
    const elapsedMinutes = elapsedMs / 60_000;
    // Clockwork Stipend: credit the player's chosen resource trickle BEFORE
    // upkeep drain, so the trickle helps cover upkeep on a starved empire
    // instead of being instantly clawed back.
    const trickle = chosenTrickleRateForPlayer(player);
    if (trickle && trickle.ratePerMinute > 0) {
      const credit = trickle.ratePerMinute * elapsedMinutes;
      if (credit > 0) {
        const current = player.strategicResources ?? {};
        player.strategicResources = {
          ...current,
          [trickle.resource]: (current[trickle.resource] ?? 0) + credit
        };
      }
    }
    const need: UpkeepNeed = {
      gold: Math.max(0, upkeep.gold) * elapsedMinutes,
      FOOD: Math.max(0, upkeep.food) * elapsedMinutes,
      IRON: Math.max(0, upkeep.iron) * elapsedMinutes,
      CRYSTAL: Math.max(0, upkeep.crystal) * elapsedMinutes,
      SUPPLY: Math.max(0, upkeep.supply) * elapsedMinutes
    };
    // Towns pay their own upkeep from accumulated yield before raiding the
    // treasury — mirrors the legacy server's `consumeYieldForPlayer` order
    // so an offline player whose tile income covers upkeep keeps the
    // stockpile they logged out with.
    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);
    if (need.gold > 0) {
      player.points = Math.max(0, (player.points ?? 0) - need.gold);
    }
    const stock = {
      FOOD: player.strategicResources?.FOOD ?? 0,
      IRON: player.strategicResources?.IRON ?? 0,
      CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
      SUPPLY: player.strategicResources?.SUPPLY ?? 0,
      SHARD: player.strategicResources?.SHARD ?? 0
    };
    let mutated = false;
    for (const res of ["FOOD", "IRON", "CRYSTAL", "SUPPLY"] as const) {
      if (need[res] > 0) {
        stock[res] = Math.max(0, stock[res] - need[res]);
        mutated = true;
      }
    }
    if (mutated) player.strategicResources = stock;
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
  };
  // Attribution for event_loop_blocked (was empty mainThreadTasks): hit from
  // tick functions AND command handlers (via applyManpowerRegen); 15s/player
  // rate limit still allows it to land mid-command on the hot path.
  if (ctx.trackSyncMainThreadTask) {
    ctx.trackSyncMainThreadTask("apply_economy_accrual", { playerId: player.id }, run);
  } else {
    run();
  }
};
