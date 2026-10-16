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

const STRATEGIC_INCOME_KEYS = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const;

/**
 * True while a player's passive income is suspended for inactivity: a human
 * who hasn't acted for longer than `inactivityCapMs`. AI players are exempt
 * (see applyPassiveIncomeForPlayer's doc comment for why).
 */
export const isPassiveIncomePaused = (
  player: Pick<RuntimePlayer, "isAi">,
  lastActiveAtMs: number | undefined,
  nowMs: number,
  inactivityCapMs: number
): boolean => !player.isAi && nowMs - (lastActiveAtMs ?? 0) > inactivityCapMs;

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
  if (isPassiveIncomePaused(player, ctx.lastActiveAtMsByPlayer.get(player.id), nowMs, inactivityCapMs)) return;

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
  const storageCap = computeEmpireStorageCap(summary, economy.strategicProductionPerMinute);

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

/**
 * Gold a player earned while away, for the welcome-back summary.
 * `goldPerMinuteOverride` lets callers that already computed the player's
 * income this request (e.g. the login snapshot build) reuse that value
 * instead of paying a second, synchronous `cachedEconomySnapshot` rebuild
 * on the live runtime — that rebuild scales with settled-tile count and
 * was blocking the post-subscribe WS event flush (bootstrap/hydrate/
 * welcome-back) whenever the per-player cache had just been invalidated
 * by a recent settle. The result is discarded below 60s of elapsed time
 * regardless, so we also skip the economy lookup entirely in that case.
 */
export const welcomeBackSummaryForPlayer = (
  ctx: Pick<RuntimePassiveIncomeContext, "players" | "lastIncomeTickAtMsByPlayer" | "cachedEconomySnapshot">,
  playerId: string,
  nowMs: number,
  goldPerMinuteOverride?: number
): { goldEarned: number; elapsedMs: number } => {
  const lastTickAt = ctx.lastIncomeTickAtMsByPlayer.get(playerId);
  if (lastTickAt === undefined) return { goldEarned: 0, elapsedMs: 0 };
  const elapsedMs = Math.max(0, nowMs - lastTickAt);
  if (elapsedMs <= 60_000) return { goldEarned: 0, elapsedMs };
  const goldPerMinute =
    goldPerMinuteOverride ?? (() => {
      const player = ctx.players.get(playerId);
      return player ? ctx.cachedEconomySnapshot(player).incomePerMinute : 0;
    })();
  const goldEarned = goldPerMinute * (elapsedMs / 60_000);
  return { goldEarned: Math.floor(goldEarned), elapsedMs };
};
