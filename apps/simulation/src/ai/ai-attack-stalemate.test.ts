import { describe, expect, it } from "vitest";

import {
  ATTACK_STALEMATE_ATTEMPTS_THRESHOLD,
  ATTACK_STALEMATE_WINDOW_MS,
  createAttackStalemateTracker
} from "./ai-attack-stalemate.js";

const fillToThreshold = (
  tracker: ReturnType<typeof createAttackStalemateTracker>,
  playerId: string,
  targetTileKey: string,
  startMs: number
): void => {
  for (let i = 0; i < ATTACK_STALEMATE_ATTEMPTS_THRESHOLD; i += 1) {
    tracker.recordAttempt(playerId, targetTileKey, startMs + i * 1000);
  }
};

describe("ai-attack-stalemate", () => {
  it("does not flag a target before the attempt threshold is met", () => {
    const tracker = createAttackStalemateTracker();
    for (let i = 0; i < ATTACK_STALEMATE_ATTEMPTS_THRESHOLD - 1; i += 1) {
      tracker.recordAttempt("ai-4", "5,278", 1000 + i * 100);
    }
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual([]);
  });

  it("flags a target once the attempt threshold is reached", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 1000);
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual(["5,278"]);
  });

  it("scopes stalemate state per player", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 1000);
    expect(tracker.stalemateTargetsForPlayer("ai-3")).toEqual([]);
  });

  it("clears a target across all players (e.g. on capture)", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 1000);
    fillToThreshold(tracker, "ai-3", "5,278", 2000);
    tracker.clearTarget("5,278");
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual([]);
    expect(tracker.stalemateTargetsForPlayer("ai-3")).toEqual([]);
  });

  it("rolls the counter when the gap between attempts exceeds the window", () => {
    const tracker = createAttackStalemateTracker();
    // Bring the counter to (threshold - 1).
    for (let i = 0; i < ATTACK_STALEMATE_ATTEMPTS_THRESHOLD - 1; i += 1) {
      tracker.recordAttempt("ai-4", "5,278", 1000 + i * 100);
    }
    // Skip past the window — next attempt resets the counter.
    tracker.recordAttempt("ai-4", "5,278", 1000 + ATTACK_STALEMATE_WINDOW_MS + 10_000);
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual([]);
  });

  it("expires entries whose last attempt is at or before the cutoff", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 1000);
    const lastAttemptAt = 1000 + (ATTACK_STALEMATE_ATTEMPTS_THRESHOLD - 1) * 1000;
    tracker.expireOlderThan(lastAttemptAt);
    expect(tracker.size()).toBe(0);
  });

  it("keeps entries newer than the cutoff during expire", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 10_000);
    tracker.expireOlderThan(0);
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual(["5,278"]);
  });

  it("allows retry after a clear (counter starts fresh)", () => {
    const tracker = createAttackStalemateTracker();
    fillToThreshold(tracker, "ai-4", "5,278", 1000);
    tracker.clearTarget("5,278");
    tracker.recordAttempt("ai-4", "5,278", 9_999_999);
    expect(tracker.stalemateTargetsForPlayer("ai-4")).toEqual([]);
  });
});
