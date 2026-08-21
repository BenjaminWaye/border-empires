// Stage 3 economy/manpower extraction out of runtime.ts (see AGENTS.md /
// docs/agents/topic-runbooks.md for the god-class breakup plan). These are
// pure relocations of existing runtime.ts method bodies into free functions
// that take their dependencies explicitly via RuntimeManpowerEconomyContext,
// mirroring the build*CommandContext pattern used in Stage 1/2. No numeric
// formula or rounding behavior was changed — only moved.
import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import type { RuntimePlayer } from "../runtime-types.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { ManpowerStructureBonus } from "../runtime-manpower-structure-bonus.js";
import {
  effectiveManpowerAt as effectiveManpowerAtImpl,
  playerManpowerBreakdownFromSummary,
  playerManpowerCapFromSummary,
  playerManpowerRegenPerMinuteFromSummary
} from "../runtime-manpower.js";
import { TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import * as wonderEffects from "../runtime-natural-wonders.js";

export interface RuntimeManpowerEconomyContext {
  now: () => number;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  cachedManpowerStructureBonusForPlayer: (player: RuntimePlayer) => ManpowerStructureBonus;
  wonderCacheByPlayer: Map<string, Set<string>>;
  getAbilityCooldownUntil: (playerId: string, abilityKey: string) => number;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
}

export function playerManpowerCap(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  if (player.id === "barbarian-1") return Number.MAX_SAFE_INTEGER;
  const { garrisonHallCount, assemblyWorksNetworkGarrisonHallCount } = ctx.cachedManpowerStructureBonusForPlayer(player);
  return (
    playerManpowerCapFromSummary(ctx.summaryForPlayer(player.id), garrisonHallCount, assemblyWorksNetworkGarrisonHallCount) +
    (wonderEffects.playerHasWonderType(ctx.wonderCacheByPlayer, player.id, "CONSCRIPTION_ENGINE") ? 2000 : 0)
  );
}

export function playerManpowerRegenPerMinute(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  // The Iron Levy (tech-tree redesign): a 2-hour empire-wide manpower
  // regen freeze after triggering the muster ability.
  if (ctx.getAbilityCooldownUntil(player.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > ctx.now()) return 0;
  const { railDepotNetworkLogisticsGuildCount, logisticsGuildCount, populationBureauManpowerBuildingCount } =
    ctx.cachedManpowerStructureBonusForPlayer(player);
  return playerManpowerRegenPerMinuteFromSummary(
    ctx.summaryForPlayer(player.id),
    railDepotNetworkLogisticsGuildCount,
    logisticsGuildCount,
    populationBureauManpowerBuildingCount
  );
}

export function playerLogisticsThroughputPerMinute(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  // Logistics throughput = same as manpower regen for now; tune later.
  return playerManpowerRegenPerMinute(ctx, player);
}

export function playerManpowerBreakdown(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): ManpowerBreakdown {
  const {
    garrisonHallCount,
    assemblyWorksNetworkGarrisonHallCount,
    railDepotNetworkLogisticsGuildCount,
    logisticsGuildCount,
    populationBureauManpowerBuildingCount
  } = ctx.cachedManpowerStructureBonusForPlayer(player);
  return playerManpowerBreakdownFromSummary(
    ctx.summaryForPlayer(player.id),
    garrisonHallCount,
    assemblyWorksNetworkGarrisonHallCount,
    railDepotNetworkLogisticsGuildCount,
    logisticsGuildCount,
    populationBureauManpowerBuildingCount
  );
}

export function effectiveManpowerAtForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): number {
  const cap = playerManpowerCap(ctx, player);
  return effectiveManpowerAtImpl(player, cap, playerManpowerRegenPerMinute(ctx, player), nowMs);
}

export function applyManpowerRegenForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): void {
  ctx.applyEconomyAccrual(player, nowMs);
  refreshManpowerOnlyForPlayer(ctx, player, nowMs);
}

/**
 * Manpower-only variant of {@link applyManpowerRegenForPlayer} that skips the
 * economy-accrual side effect. The accrual is O(territory tiles) per call
 * (it sorts the player's territory tile keys for upkeep collection); doing
 * it per player on every planner-state export was the dominant source of
 * the recurring 1.4-2.0 s `sync_players_export` block on staging. Skipping
 * here is safe because the accrual still runs on every real command path
 * and on the periodic tick, so player gold/resources catch up within a
 * single planner cycle.
 */
export function refreshManpowerOnlyForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): void {
  const cap = playerManpowerCap(ctx, player);
  if (!Number.isFinite(player.manpower)) {
    player.manpower = cap;
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
  if (cap > previousCap) {
    player.manpower = Math.min(cap, Math.max(0, player.manpower) + (cap - previousCap));
  }
  if (!Number.isFinite(player.manpowerUpdatedAt)) {
    player.manpower = Math.max(0, Math.min(cap, player.manpower));
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  player.manpower = effectiveManpowerAtForPlayer(ctx, player, nowMs);
  player.manpowerUpdatedAt = nowMs;
  player.manpowerCapSnapshot = cap;
}
