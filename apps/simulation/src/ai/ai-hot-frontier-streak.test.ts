import { describe, expect, it } from "vitest";

import { recordHotFrontierStreak, shouldForceBroadFrontierScan } from "./ai-hot-frontier-streak.js";
import { AI_HOT_FRONTIER_MAX_STREAK_TICKS } from "./automation-command-planner-types.js";

describe("ai-hot-frontier-streak", () => {
  it("does not force a broad scan below the streak cap", () => {
    const streaks = new Map<string, number>([["ai-1", AI_HOT_FRONTIER_MAX_STREAK_TICKS - 1]]);
    expect(shouldForceBroadFrontierScan(streaks, "ai-1")).toBe(false);
  });

  it("forces a broad scan once the streak reaches the cap", () => {
    const streaks = new Map<string, number>([["ai-1", AI_HOT_FRONTIER_MAX_STREAK_TICKS]]);
    expect(shouldForceBroadFrontierScan(streaks, "ai-1")).toBe(true);
  });

  it("treats a missing entry as streak 0 (never forces)", () => {
    const streaks = new Map<string, number>();
    expect(shouldForceBroadFrontierScan(streaks, "ai-1")).toBe(false);
  });

  it("increments the streak on a skipped tick", () => {
    const streaks = new Map<string, number>([["ai-1", 2]]);
    recordHotFrontierStreak(streaks, "ai-1", true);
    expect(streaks.get("ai-1")).toBe(3);
  });

  it("resets the streak to absent once the broad sweep actually ran", () => {
    const streaks = new Map<string, number>([["ai-1", AI_HOT_FRONTIER_MAX_STREAK_TICKS]]);
    // A forced tick always reports broadFallbackSkipped: false (the sweep ran),
    // so the streak clears — this is how the throttle self-resets after forcing.
    recordHotFrontierStreak(streaks, "ai-1", false);
    expect(streaks.has("ai-1")).toBe(false);
  });

  it("treats an undefined diagnostic (no scan ran) the same as false", () => {
    const streaks = new Map<string, number>([["ai-1", 4]]);
    recordHotFrontierStreak(streaks, "ai-1", undefined);
    expect(streaks.has("ai-1")).toBe(false);
  });
});
