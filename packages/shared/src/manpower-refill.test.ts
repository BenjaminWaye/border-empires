import { describe, expect, it } from "vitest";

import { lastManpowerRefillAtMs, MANPOWER_REFILL_WINDOW_MS, manpowerRefillOffsetMs, nextManpowerRefillAtMs } from "./manpower-refill.js";

const NOW = 1_790_000_000_000;

describe("manpower refill schedule", () => {
  it("is stable per player and inside the window", () => {
    const offset = manpowerRefillOffsetMs("player-a");
    expect(manpowerRefillOffsetMs("player-a")).toBe(offset);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(MANPOWER_REFILL_WINDOW_MS);
  });

  it("staggers different players across the window", () => {
    const offsets = new Set(Array.from({ length: 50 }, (_, index) => manpowerRefillOffsetMs(`player-${index}`)));
    expect(offsets.size).toBeGreaterThan(40);
  });

  it("puts the last boundary at or before now and the next exactly one window later", () => {
    for (const id of ["player-a", "player-b", "ai-3"]) {
      const last = lastManpowerRefillAtMs(id, NOW);
      expect(last).toBeLessThanOrEqual(NOW);
      expect(NOW - last).toBeLessThan(MANPOWER_REFILL_WINDOW_MS);
      expect(nextManpowerRefillAtMs(id, NOW)).toBe(last + MANPOWER_REFILL_WINDOW_MS);
      expect(nextManpowerRefillAtMs(id, NOW)).toBeGreaterThan(NOW);
    }
  });

  it("treats an exact boundary as already refilled", () => {
    const boundary = lastManpowerRefillAtMs("player-a", NOW);
    expect(lastManpowerRefillAtMs("player-a", boundary)).toBe(boundary);
    expect(lastManpowerRefillAtMs("player-a", boundary - 1)).toBe(boundary - MANPOWER_REFILL_WINDOW_MS);
  });
});
