import { PASSIVE_INCOME_INACTIVITY_CAP_MS } from "@border-empires/game-domain";
import { buildPlayerUpdateEconomySnapshot, type PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";

import { isPassiveIncomePaused } from "./runtime-passive-income.js";
import type { RuntimePlayer, UpkeepNeed } from "./runtime-types.js";
import type { UpkeepAccrualSnapshot } from "./player-upkeep-incremental/player-upkeep-incremental.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { MainThreadTaskTracker } from "./main-thread-task-tracker/main-thread-task-tracker.js";
import type { DomainTileState } from "@border-empires/game-domain";

type TrackSync = MainThreadTaskTracker["trackSync"];

export type RuntimeUpkeepAccrualContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  lastEconomyAccrualAtByPlayer: Map<string, number>;
  lastActiveAtMsByPlayer: ReadonlyMap<string, number>;
  playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>;
  cachedUpkeepAccrual: (player: RuntimePlayer) => UpkeepAccrualSnapshot;
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  onUpkeepNettedWhileIncomePaused?: ((playerId: string) => void) | undefined;
  trackSyncMainThreadTask?: TrackSync | undefined;
};

/**
 * Gold upkeep (converter structures — tileUpkeepContribution in
 * player-upkeep-incremental.ts) is normally paid in full from the treasury,
 * alongside the passive-income tick that credits gold straight to it. While
 * a human's passive income is paused for inactivity, their income instead
 * offsets the upkeep: the treasury only pays the shortfall, so an empire
 * whose income covers its upkeep keeps the gold it logged out with rather
 * than draining to zero. Mutates `need.gold` in place.
 */
export const offsetGoldUpkeepWhileIncomePaused = (
  ctx: Pick<RuntimeUpkeepAccrualContext, "lastActiveAtMsByPlayer" | "cachedEconomySnapshot" | "onUpkeepNettedWhileIncomePaused">,
  player: RuntimePlayer,
  need: UpkeepNeed,
  elapsedMinutes: number,
  nowMs: number
): void => {
  if (need.gold <= 0) return;
  if (!isPassiveIncomePaused(player, ctx.lastActiveAtMsByPlayer.get(player.id), nowMs, PASSIVE_INCOME_INACTIVITY_CAP_MS)) return;
  const income = Math.max(0, ctx.cachedEconomySnapshot(player).incomePerMinute) * elapsedMinutes;
  need.gold = Math.max(0, need.gold - income);
  ctx.onUpkeepNettedWhileIncomePaused?.(player.id);
};

/**
 * Rate-limited (15s) per-player economy tick: drains upkeep from the
 * treasury and strategic stockpiles (gold upkeep netted against income while
 * passive income is paused — see offsetGoldUpkeepWhileIncomePaused). Sharing
 * the 15s cadence with the passive-income tick keeps drain/credit in sync.
 */
export const applyEconomyAccrual = (ctx: RuntimeUpkeepAccrualContext, player: RuntimePlayer, nowMs: number): void => {
  const last = ctx.lastEconomyAccrualAtByPlayer.get(player.id);
  if (last === undefined) {
    ctx.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
    return;
  }
  const elapsedMs = nowMs - last;
  if (elapsedMs <= 0) return;
  // Rate-limit to once per 15s — this is triggered on every AI command
  // (~1/s). The passive income tick (also 15s) handles income; upkeep drain
  // on the same cadence keeps the two in sync.
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
      }, undefined, undefined, undefined, undefined, nowMs);
      // Round both sides to 4dp to match buildPlayerUpdateEconomySnapshot's
      // toFixed(4) on upkeepPerMinute — avoids false positives from raw-float
      // rounding noise below the gameplay-significant precision.
      const round4 = (n: number): number => Number(n.toFixed(4));
      const mismatches: string[] = [];
      for (const key of ["gold", "food", "titanium", "crystal", "umbrite"] as const) {
        const inc = round4(upkeep[key]);
        const fullV = round4((full.upkeepPerMinute as Record<string, number | undefined>)[key] ?? 0);
        if (inc !== fullV) mismatches.push(`${key}: incremental=${inc} full=${fullV}`);
      }
      if (mismatches.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`[DEV_ASSERT_ECONOMY_INCREMENTAL] player=${player.id} mismatch: ${mismatches.join(", ")}`);
      }
    }
    const elapsedMinutes = elapsedMs / 60_000;
    const need: UpkeepNeed = {
      gold: Math.max(0, upkeep.gold) * elapsedMinutes,
      FOOD: Math.max(0, upkeep.food) * elapsedMinutes,
      TITANIUM: Math.max(0, upkeep.titanium) * elapsedMinutes,
      CRYSTAL: Math.max(0, upkeep.crystal) * elapsedMinutes,
      UMBRITE: Math.max(0, upkeep.umbrite) * elapsedMinutes
    };
    offsetGoldUpkeepWhileIncomePaused(ctx, player, need, elapsedMinutes, nowMs);
    if (need.gold > 0) {
      player.points = Math.max(0, (player.points ?? 0) - need.gold);
    }
    const stock = {
      FOOD: player.strategicResources?.FOOD ?? 0,
      TITANIUM: player.strategicResources?.TITANIUM ?? 0,
      CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
      UMBRITE: player.strategicResources?.UMBRITE ?? 0,
      SHARD: player.strategicResources?.SHARD ?? 0
    };
    let mutated = false;
    for (const res of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
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
