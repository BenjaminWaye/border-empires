import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, lastManpowerRefillAtMs } from "@border-empires/shared";
import { freshNextBatchAmount, nextBatchGain } from "./client-manpower-refill.js";

describe("freshNextBatchAmount", () => {
  const me = "player-1";
  const windowStart = lastManpowerRefillAtMs(me, 10 * MANPOWER_REFILL_WINDOW_MS);

  it("keeps the amount until the refill it describes has landed", () => {
    expect(freshNextBatchAmount(me, 1200, windowStart + 1, windowStart + 60_000)).toBe(1200);
    // Regression: after the boundary the HUD kept showing the batch that had already been paid.
    expect(freshNextBatchAmount(me, 1200, windowStart + 1, windowStart + MANPOWER_REFILL_WINDOW_MS + 1)).toBeUndefined();
  });

  it("is undefined without a player, an amount or a receive time", () => {
    expect(freshNextBatchAmount(undefined, 1200, windowStart, windowStart)).toBeUndefined();
    expect(freshNextBatchAmount(me, undefined, windowStart, windowStart)).toBeUndefined();
    expect(freshNextBatchAmount(me, 1200, undefined, windowStart)).toBeUndefined();
  });
});

describe("nextBatchGain", () => {
  it("clamps to the room under the cap and never goes negative", () => {
    expect(nextBatchGain(100, 500, 200)).toBe(200);
    expect(nextBatchGain(450, 500, 200)).toBe(50);
    expect(nextBatchGain(600, 500, 200)).toBe(0);
  });
});
