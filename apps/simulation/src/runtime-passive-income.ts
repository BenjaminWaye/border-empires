import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { computeEmpireStorageCap } from "./runtime-empire-storage.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer, StrategicResourceKey } from "./runtime-types.js";

type TrackSync = <T>(phase: string, details: Record<string, string> | undefined, task: () => T) => T;

export type RuntimePassiveIncomeContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  lastActiveAtMsByPlayer: ReadonlyMap<string, number>;
  lastIncomeTickAtMsByPlayer: Map<string, number>;
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  addStrategicResource: (player: RuntimePlayer, resource: StrategicResourceKey, amount: number) => void;
  emitPlayerStateUpdate: (input: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
  trackSyncMainThreadTask?: TrackSync;
};

const STRATEGIC_INCOME_KEYS = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const;

/**
 * Credits passive gold + strategic resource income for a single player since
 * their last income tick.
 *
 * AI players are exempt from the inactivity cap: a human who's away from
 * keyboard should stop earning gold, but an AI empire that's "inactive"
 * (never submits a command — see ai-command-producer.ts, which only submits
 * when the planner produces something other than WAIT) is inactive
 * *because* it's broke and stuck, not because anyone stepped away. Applying
 * the human AFK cap to AI players creates a one-way trap: WAIT -> no
 * command submitted -> lastActiveAt never refreshes -> after
 * inactivityCapMs, income stops forever -> permanently broke -> still WAIT.
 */
export const applyPassiveIncomeForPlayer = (
  ctx: RuntimePassiveIncomeContext,
  player: RuntimePlayer,
  nowMs: number,
  inactivityCapMs: number
): void => {
  if (!player.isAi) {
    const lastActiveAt = ctx.lastActiveAtMsByPlayer.get(player.id) ?? 0;
    if (nowMs - lastActiveAt > inactivityCapMs) return;
  }

  const lastTickAt = ctx.lastIncomeTickAtMsByPlayer.get(player.id);
  if (lastTickAt === undefined) {
    ctx.lastIncomeTickAtMsByPlayer.set(player.id, nowMs);
    return;
  }

  const elapsedMs = nowMs - lastTickAt;
  if (elapsedMs <= 0) return;
  const elapsedMinutes = elapsedMs / 60_000;

  const economy = ctx.cachedEconomySnapshot(player);
  const goldPerMinute = economy.incomePerMinute;
  const summary = ctx.summaryForPlayer(player.id);
  const storageCap = computeEmpireStorageCap(summary, economy.goldCapIncomePerMinute, economy.strategicProductionPerMinute);

  let anyCredited = false;
  const goldEarned = goldPerMinute * elapsedMinutes;
  if (goldEarned > 0) {
    const availableGoldCap = Math.max(0, storageCap.GOLD - player.points);
    const creditedGold = Math.min(goldEarned, availableGoldCap);
    if (creditedGold > 0) {
      player.points += creditedGold;
      anyCredited = true;
    }
  }

  const sp = economy.strategicProductionPerMinute;
  for (const resource of STRATEGIC_INCOME_KEYS) {
    const ratePerMinute = sp[resource] ?? 0;
    if (ratePerMinute <= 0) continue;
    const earned = ratePerMinute * elapsedMinutes;
    const cap = storageCap[resource as keyof typeof storageCap] ?? 0;
    const current = (player.strategicResources ?? {})[resource] ?? 0;
    const available = Math.max(0, cap - current);
    const credited = Math.min(earned, available);
    if (credited > 0) {
      ctx.addStrategicResource(player, resource, credited);
      anyCredited = true;
    }
  }

  ctx.lastIncomeTickAtMsByPlayer.set(player.id, nowMs);

  if (anyCredited) {
    ctx.emitPlayerStateUpdate({ commandId: `income-tick:${player.id}:${nowMs}`, playerId: player.id });
  }
};

export const applyPassiveIncome = (ctx: RuntimePassiveIncomeContext, nowMs: number, inactivityCapMs: number): void => {
  for (const player of ctx.players.values()) {
    applyPassiveIncomeForPlayer(ctx, player, nowMs, inactivityCapMs);
  }
};

export const applyPassiveIncomeAsync = async (
  ctx: RuntimePassiveIncomeContext,
  nowMs: number,
  inactivityCapMs: number,
  yieldToEventLoop: () => Promise<void>
): Promise<void> => {
  const ts = ctx.trackSyncMainThreadTask;
  for (const player of ctx.players.values()) {
    const apply = () => applyPassiveIncomeForPlayer(ctx, player, nowMs, inactivityCapMs);
    if (ts) {
      ts("apply_passive_income_for_player", { playerId: player.id }, apply);
    } else {
      apply();
    }
    await yieldToEventLoop();
  }
};
