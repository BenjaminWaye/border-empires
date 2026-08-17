import { describe, expect, it } from "vitest";

import { isEligibleShardRainPlayer, shardRainSiteCountRange } from "./runtime-shard-rain-rules.js";

describe("isEligibleShardRainPlayer", () => {
  it("is true for a regular human player", () => {
    expect(isEligibleShardRainPlayer({ id: "human-1", isAi: false })).toBe(true);
  });

  it("is false for the shard rain system actor, AI players, and barbarians", () => {
    expect(isEligibleShardRainPlayer({ id: "system-shard-rain", isAi: false })).toBe(false);
    expect(isEligibleShardRainPlayer({ id: "ai-1", isAi: true })).toBe(false);
    // Barbarians deliberately carry isAi: false (see isAiControlledActor) but are still excluded by id prefix.
    expect(isEligibleShardRainPlayer({ id: "barbarian-1", isAi: false })).toBe(false);
  });
});

describe("shardRainSiteCountRange", () => {
  it("matches the un-scaled 3-6 baseline for a small player count", () => {
    expect(shardRainSiteCountRange(0)).toEqual({ min: 3, max: 6 });
    expect(shardRainSiteCountRange(3)).toEqual({ min: 3, max: 6 });
  });

  it("adds 1 site per 4 eligible players once the count crosses a multiple of 4", () => {
    expect(shardRainSiteCountRange(4)).toEqual({ min: 4, max: 7 });
    expect(shardRainSiteCountRange(8)).toEqual({ min: 5, max: 8 });
    expect(shardRainSiteCountRange(100)).toEqual({ min: 28, max: 31 });
  });

  it("never scales down for a negative count", () => {
    expect(shardRainSiteCountRange(-5)).toEqual({ min: 3, max: 6 });
  });
});
