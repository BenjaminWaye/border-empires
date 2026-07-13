import { describe, expect, it } from "vitest";

import { buildAiTickIterationOrder, DEFAULT_STARVATION_GUARD_MS } from "./ai-tick-fairness.js";

describe("buildAiTickIterationOrder", () => {
  const aiPlayerIds = ["ai-1", "ai-2", "ai-3", "ai-4", "ai-5"];

  it("falls back to plain round-robin when nothing is urgent or starved", () => {
    const order = buildAiTickIterationOrder({
      aiPlayerIds,
      urgentPlayerIds: new Set(),
      nextPlayerIndex: 2,
      lastConsideredAtByPlayer: new Map(),
      nowMs: 0,
      starvationGuardMs: DEFAULT_STARVATION_GUARD_MS
    });
    expect(order).toEqual([2, 3, 4, 0, 1]);
  });

  it("puts urgent players ahead of the round-robin sweep", () => {
    const order = buildAiTickIterationOrder({
      aiPlayerIds,
      urgentPlayerIds: new Set(["ai-4"]),
      nextPlayerIndex: 0,
      lastConsideredAtByPlayer: new Map(),
      nowMs: 0,
      starvationGuardMs: DEFAULT_STARVATION_GUARD_MS
    });
    expect(order[0]).toBe(3); // ai-4
    expect(order).toEqual([3, 0, 1, 2, 4]);
  });

  it("regression: without the starvation guard, a persistently-urgent player would starve round-robin players forever — the guard bounds this", () => {
    // ai-3 and ai-4 have been continuously urgent (e.g. under sustained
    // barbarian/enemy attack) and have been considered recently.
    // ai-2 and ai-5 have never been considered and are well past the guard window.
    const lastConsideredAtByPlayer = new Map([
      ["ai-1", 9_000],
      ["ai-3", 9_800],
      ["ai-4", 9_900]
      // ai-2, ai-5 never considered — default to 0.
    ]);
    const order = buildAiTickIterationOrder({
      aiPlayerIds,
      urgentPlayerIds: new Set(["ai-3", "ai-4"]),
      nextPlayerIndex: 0,
      lastConsideredAtByPlayer,
      nowMs: 10_000,
      starvationGuardMs: DEFAULT_STARVATION_GUARD_MS
    });
    // ai-2 (idx 1) and ai-5 (idx 4) are starved (10_000 - 0 > 2_000ms guard)
    // and must be promoted ahead of the urgent players, oldest-unconsidered
    // first. Both are equally stale (never considered) so original index
    // order is preserved by the stable sort.
    expect(order.slice(0, 2)).toEqual([1, 4]);
    // Urgent players still come next, then whatever round-robin remains.
    expect(order).toEqual([1, 4, 2, 3, 0]);
  });

  it("does not duplicate a player who is both starved and urgent", () => {
    const lastConsideredAtByPlayer = new Map([["ai-1", 0]]);
    const order = buildAiTickIterationOrder({
      aiPlayerIds,
      urgentPlayerIds: new Set(["ai-1"]),
      nextPlayerIndex: 0,
      lastConsideredAtByPlayer,
      nowMs: 10_000,
      starvationGuardMs: DEFAULT_STARVATION_GUARD_MS
    });
    expect(order.filter((idx) => idx === 0)).toHaveLength(1);
    expect(order[0]).toBe(0);
  });

  it("promotes the most-starved player first among multiple starved players", () => {
    const lastConsideredAtByPlayer = new Map([
      ["ai-1", 5_000],
      ["ai-2", 1_000], // most starved
      ["ai-3", 4_000],
      ["ai-4", 6_000],
      ["ai-5", 7_000]
    ]);
    const order = buildAiTickIterationOrder({
      aiPlayerIds,
      urgentPlayerIds: new Set(),
      nextPlayerIndex: 0,
      lastConsideredAtByPlayer,
      nowMs: 10_000,
      starvationGuardMs: DEFAULT_STARVATION_GUARD_MS
    });
    // All are past the 2s guard from nowMs=10_000; ai-2 (considered at 1_000)
    // is the oldest, so it should be promoted first.
    expect(order[0]).toBe(1);
  });
});
