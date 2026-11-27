import { PASSIVE_INCOME_INACTIVITY_CAP_MS } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { computeEmpireStorageCap } from "./runtime-empire-storage.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer, StrategicResourceKey } from "./runtime-types.js";
import { hasAwaitingSettleEntry } from "./runtime-dev-queue-settle-manpower-wait.js";

type TrackSync = <T>(phase: string, details: Record<string, string> | undefined, task: () => T) => T;

export type RuntimePassiveIncomeContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  lastActiveAtMsByPlayer: ReadonlyMap<string, number>;
  lastIncomeTickAtMsByPlayer: Map<string, number>;
  activeCoinTransfers?: (id: string, at: number) => readonly { to: string; perHour: number; startedAt: number }[];
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  addStrategicResource: (player: RuntimePlayer, resource: StrategicResourceKey, amount: number) => void;
  emitPlayerStateUpdate: (input: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
  trackSyncMainThreadTask?: TrackSync;
  /** Settles manpower (only) and moves queued garrisons that were waiting on it (runtime-dev-queue-settle-manpower-wait.ts). Only called while one is waiting. */
  tickAwaitingSettleEntries?: (player: RuntimePlayer, nowMs: number) => void;
};

const STRATEGIC_INCOME_KEYS = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const;

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

/** Reset the collection cursor when activity resumes after an inactive interval. */
export const resumePassiveIncome = (
  player: Pick<RuntimePlayer, "isAi"> | undefined,
  lastActiveAt: number | undefined,
  lastIncomeTickAtByPlayer: Map<string, number>,
  playerId: string,
  nowMs: number
): void => {
  if (!player || player.isAi) return;
  const collectedAt = lastIncomeTickAtByPlayer.get(playerId);
  if (collectedAt !== undefined && nowMs > collectedAt &&
    isPassiveIncomePaused(player, lastActiveAt ?? collectedAt, nowMs, PASSIVE_INCOME_INACTIVITY_CAP_MS)) {
    lastIncomeTickAtByPlayer.set(playerId, nowMs);
  }
};

/**
 * A human's command or subscribe: resumes paused income (resumePassiveIncome) and stamps the
 * activity on the map the income tick reads and on the player record, which snapshots save.
 */
export const recordPlayerActivity = (
  player: RuntimePlayer | undefined,
  lastActiveAtByPlayer: Map<string, number>,
  lastIncomeTickAtByPlayer: Map<string, number>,
  playerId: string,
  nowMs: number
): void => {
  resumePassiveIncome(player, lastActiveAtByPlayer.get(playerId), lastIncomeTickAtByPlayer, playerId, nowMs);
  lastActiveAtByPlayer.set(playerId, nowMs);
  if (player) player.lastActiveAt = nowMs;
};

/**
 * Boot: the income cursors and each player's last activity from the snapshot. The activity map
 * lived only in memory, so after every restart a human who had not acted since read as inactive
 * since 1970 and earned nothing until they came back; away over 24h from the restart, they
 * then lost all of it (Playtest Run 5: new players at 0 coin after a day away).
 */
export const restorePassiveIncomeClocks = (
  collectionEpochs: ReadonlyArray<{ playerId: string; collectedAt: number }> | undefined,
  players: ReadonlyMap<string, Pick<RuntimePlayer, "lastActiveAt">>,
  lastIncomeTickAtByPlayer: Map<string, number>,
  lastActiveAtByPlayer: Map<string, number>
): void => {
  for (const entry of collectionEpochs ?? []) lastIncomeTickAtByPlayer.set(entry.playerId, entry.collectedAt);
  for (const [playerId, player] of players) if (typeof player.lastActiveAt === "number") lastActiveAtByPlayer.set(playerId, player.lastActiveAt);
};

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
  inactivityCapMs: number,
  emitUpdate = true
): void => {
  // Before the inactivity gate: manpower keeps refilling for an AFK player, so
  // their waiting garrisons should still go out. The hook settles manpower
  // only (no economy accrual), so it charges an AFK player nothing. Skipped
  // on the silent pre-change settles (emitUpdate=false), which must not
  // dispatch anything.
  if (emitUpdate && ctx.tickAwaitingSettleEntries && hasAwaitingSettleEntry(ctx.summaryForPlayer(player.id))) {
    ctx.tickAwaitingSettleEntries(player, nowMs);
  }
  if (isPassiveIncomePaused(player, ctx.lastActiveAtMsByPlayer.get(player.id), nowMs, inactivityCapMs)) return;

  const lastTickAt = ctx.lastIncomeTickAtMsByPlayer.get(player.id);
  if (lastTickAt === undefined) {
    ctx.lastIncomeTickAtMsByPlayer.set(player.id, nowMs);
    return;
  }

  if (nowMs <= lastTickAt) return;
  const economy = ctx.cachedEconomySnapshot(player);
  // Rebuilding the economy can expire a supply deal and settle income up to
  // that deadline at the previous rate. Only credit the remaining interval.
  const collectedThrough = ctx.lastIncomeTickAtMsByPlayer.get(player.id) ?? lastTickAt;
  const elapsedMs = nowMs - collectedThrough;
  if (elapsedMs <= 0) return;
  const elapsedMinutes = elapsedMs / 60_000;
  const goldPerMinute = economy.incomePerMinute;
  const summary = ctx.summaryForPlayer(player.id);
  const storageCap = computeEmpireStorageCap(summary, economy.strategicProductionPerMinute);

  let anyCredited = false;
  const earned = goldPerMinute * elapsedMinutes;
  const transfers = earned > 0 ? ctx.activeCoinTransfers?.(player.id, nowMs) ?? [] : [];
  const dues = transfers.map(transfer => {
    const durationMs = Math.max(0, nowMs - Math.max(collectedThrough, transfer.startedAt));
    return { to: transfer.to, durationMs, amount: transfer.perHour * durationMs / 3_600_000 };
  });
  const scheduled = dues.reduce((sum, due) => sum + due.amount, 0);
  const paymentWindowMs = Math.max(0, ...dues.map(due => due.durationMs));
  const delivered = Math.min(goldPerMinute * paymentWindowMs / 60_000, scheduled);
  const paidIds = new Set<string>();
  let paid = 0;
  if (delivered > 0) {
    const scale = delivered / scheduled;
    for (const due of dues) {
      const recipient = ctx.players.get(due.to);
      if (!recipient || due.amount <= 0) continue;
      const amount = due.amount * scale;
      recipient.points += amount;
      paid += amount;
      paidIds.add(recipient.id);
    }
  }
  const goldEarned = earned - paid;
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

  for (const playerId of paidIds) {
    if (emitUpdate) ctx.emitPlayerStateUpdate({ commandId: `income-tick:trade:${player.id}:${playerId}:${nowMs}`, playerId });
  }
  if (anyCredited && emitUpdate) {
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
  ctx: Pick<RuntimePassiveIncomeContext, "players" | "lastActiveAtMsByPlayer" | "lastIncomeTickAtMsByPlayer" | "cachedEconomySnapshot">,
  playerId: string,
  nowMs: number,
  goldPerMinuteOverride?: number
): { goldEarned: number; elapsedMs: number } => {
  const lastTickAt = ctx.lastIncomeTickAtMsByPlayer.get(playerId);
  if (lastTickAt === undefined) return { goldEarned: 0, elapsedMs: 0 };
  const elapsedMs = Math.max(0, nowMs - lastTickAt);
  if (elapsedMs <= 60_000) return { goldEarned: 0, elapsedMs };
  const player = ctx.players.get(playerId);
  const lastActiveAt = ctx.lastActiveAtMsByPlayer.get(playerId) ?? lastTickAt;
  if (!player || isPassiveIncomePaused(player, lastActiveAt, nowMs, PASSIVE_INCOME_INACTIVITY_CAP_MS)) {
    return { goldEarned: 0, elapsedMs };
  }
  const goldPerMinute = goldPerMinuteOverride ?? ctx.cachedEconomySnapshot(player).incomePerMinute;
  const goldEarned = goldPerMinute * (elapsedMs / 60_000);
  return { goldEarned: Math.floor(goldEarned), elapsedMs };
};
