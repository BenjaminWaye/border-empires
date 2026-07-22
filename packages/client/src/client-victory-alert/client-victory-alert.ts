import type { SeasonVictoryObjectiveView } from "../client-types.js";

// A season-victory objective currently in its 24h hold window, closest to
// crowning a winner. Surfaced to every player — not just the leader — so
// players behind can react before it's too late. See client-hud.ts wiring
// and the #victory-alert-overlay markup/CSS for the two render states this
// feeds (expanded one-time card, collapsed persistent banner).
export type VictoryHoldAlert = {
  key: string;
  objectiveId: SeasonVictoryObjectiveView["id"];
  objectiveName: string;
  leaderPlayerId?: string;
  leaderName: string;
  isSelfLeader: boolean;
  // Absolute deadline (ms epoch), not a static "seconds remaining" snapshot —
  // this lets the render loop tick the countdown down every frame between
  // the ~5-15s server broadcasts that refresh holdRemainingSeconds, instead
  // of showing a stale number that only jumps on network updates.
  holdEndsAt: number;
};

export const victoryHoldAlertKey = (objectiveId: string, leaderPlayerId: string | undefined): string =>
  `${objectiveId}:${leaderPlayerId ?? "unknown"}`;

// Picks the objective closest to crowning a winner among every objective
// currently holding its threshold. Ties broken by objective id so the choice
// is deterministic across ticks (avoids visible flicker when two objectives
// share the same remaining second).
export const soonestHoldingObjective = (
  seasonVictory: readonly SeasonVictoryObjectiveView[]
): SeasonVictoryObjectiveView | undefined => {
  let best: SeasonVictoryObjectiveView | undefined;
  for (const objective of seasonVictory) {
    if (!objective.conditionMet) continue;
    if (typeof objective.holdRemainingSeconds !== "number") continue;
    if (objective.holdRemainingSeconds < 0) continue;
    if (
      !best ||
      objective.holdRemainingSeconds < best.holdRemainingSeconds! ||
      (objective.holdRemainingSeconds === best.holdRemainingSeconds && objective.id < best.id)
    ) {
      best = objective;
    }
  }
  return best;
};

// "23h 58m" / "42m" / "9s" — coarser than a stopwatch on purpose; the exact
// second doesn't matter for a 24h hold, and re-rendering every second with a
// wildly precise number reads as noisier than it needs to be.
export const formatHoldCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export const victoryHoldAlertFor = (
  seasonVictory: readonly SeasonVictoryObjectiveView[],
  selfPlayerId: string | undefined,
  nowMs: number = Date.now()
): VictoryHoldAlert | undefined => {
  const objective = soonestHoldingObjective(seasonVictory);
  if (!objective || typeof objective.holdRemainingSeconds !== "number") return undefined;
  const isSelfLeader = Boolean(selfPlayerId && objective.leaderPlayerId === selfPlayerId);
  return {
    key: victoryHoldAlertKey(objective.id, objective.leaderPlayerId),
    objectiveId: objective.id,
    objectiveName: objective.name,
    ...(objective.leaderPlayerId ? { leaderPlayerId: objective.leaderPlayerId } : {}),
    leaderName: objective.leaderName,
    isSelfLeader,
    holdEndsAt: nowMs + objective.holdRemainingSeconds * 1_000
  };
};

const remainingSeconds = (alert: VictoryHoldAlert, nowMs: number): number => Math.max(0, (alert.holdEndsAt - nowMs) / 1_000);

export const victoryHoldAlertTitle = (alert: VictoryHoldAlert): string =>
  alert.isSelfLeader ? "You're closing in on victory" : `${alert.leaderName} is closing in on victory`;

export const victoryHoldAlertDetail = (alert: VictoryHoldAlert, nowMs: number = Date.now()): string =>
  alert.isSelfLeader
    ? `Hold ${alert.objectiveName} for ${formatHoldCountdown(remainingSeconds(alert, nowMs))} more to win the season.`
    : `${alert.leaderName} will win via ${alert.objectiveName} in ${formatHoldCountdown(remainingSeconds(alert, nowMs))} unless stopped.`;

// Compact single-line text for the collapsed/persistent banner state.
export const victoryHoldBannerText = (alert: VictoryHoldAlert, nowMs: number = Date.now()): string =>
  alert.isSelfLeader
    ? `🏆 You're winning in ${formatHoldCountdown(remainingSeconds(alert, nowMs))} — ${alert.objectiveName}`
    : `🏆 ${alert.leaderName} winning in ${formatHoldCountdown(remainingSeconds(alert, nowMs))} — ${alert.objectiveName}`;
