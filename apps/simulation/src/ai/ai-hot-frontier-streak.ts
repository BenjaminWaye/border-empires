// Persistent per-player streak backing automation-command-planner.ts's
// forceBroadFrontierScan input (see AI_HOT_FRONTIER_MAX_STREAK_TICKS in
// automation-command-planner-types.ts): consecutive planner ticks whose
// diagnostic reported broadFallbackSkipped: true (the narrow/hot-frontier
// scan alone was actionable, so the broad sweep of the rest of the
// frontier never ran). Mirrors ai-spatial-focus.ts's unproductive-streak
// idiom, but forcing a broad sweep instead of rotating a BFS focus front.
// Kept out of runtime.ts (which owns the actual Map) to avoid growing that
// file past its line cap — runtime.ts only calls these two functions.
import { AI_HOT_FRONTIER_MAX_STREAK_TICKS } from "./automation-command-planner-types.js";

export const shouldForceBroadFrontierScan = (
  streakByPlayer: ReadonlyMap<string, number>,
  playerId: string
): boolean => (streakByPlayer.get(playerId) ?? 0) >= AI_HOT_FRONTIER_MAX_STREAK_TICKS;

export const recordHotFrontierStreak = (
  streakByPlayer: Map<string, number>,
  playerId: string,
  broadFallbackSkipped: boolean | undefined
): void => {
  if (broadFallbackSkipped) {
    streakByPlayer.set(playerId, (streakByPlayer.get(playerId) ?? 0) + 1);
  } else {
    streakByPlayer.delete(playerId);
  }
};
