import { describe, expect, it } from "vitest";
import { isInnerSupportRing, townSupportCoinMultiplier } from "./town-support-coin.js";
import { isPreferredSupportTown } from "./town-support-ring.js";

// Owner rule 2026-11-24: a City's base coin comes from its inner ring, its tier bonus from its outer ring.
describe("townSupportCoinMultiplier", () => {
  const counts = (innerCurrent: number, innerMax: number, outerCurrent: number, outerMax: number) =>
    ({ innerCurrent, innerMax, supportCurrent: innerCurrent + outerCurrent, supportMax: innerMax + outerMax });

  it("earns exactly the Town's coin with an empty outer ring, and the full tier bonus with a full one", () => {
    expect(townSupportCoinMultiplier(counts(8, 8, 0, 16), 1, 1.25)).toBe(1);
    expect(townSupportCoinMultiplier(counts(8, 8, 16, 16), 1, 1.25)).toBe(1.25);
    expect(townSupportCoinMultiplier(counts(8, 8, 8, 16), 1, 1.25)).toBeCloseTo(1.125);
  });

  // Regression: the whole ring scaled the coin, so a full Town that became a City dropped from 8/8 to 8/24.
  it("never earns less as a City than the same town did as a Town", () => {
    const asTown = townSupportCoinMultiplier(counts(8, 8, 0, 0), 1, 1);
    expect(townSupportCoinMultiplier(counts(8, 8, 0, 16), 1, 1.25)).toBeGreaterThanOrEqual(asTown);
  });

  it("scales the whole coin by the inner ring, and counts a ring with no land as held", () => {
    expect(townSupportCoinMultiplier(counts(4, 8, 16, 16), 1, 1.25)).toBeCloseTo(0.625);
    expect(townSupportCoinMultiplier(counts(0, 0, 0, 0), 1, 1.25)).toBe(1.25);
  });

  it("splits the rings at distance 1", () => {
    expect(isInnerSupportRing(1, -1)).toBe(true);
    expect(isInnerSupportRing(2, 0)).toBe(false);
  });
});

describe("isPreferredSupportTown", () => {
  // Regression: a tile two towns reach went to the lower (x, y), handing a Town's own inner plot to a farther City.
  it("gives a shared plot to the closer town, then to the lower (x, y)", () => {
    expect(isPreferredSupportTown({ x: 12, y: 10, distance: 1 }, { x: 10, y: 10, distance: 2 })).toBe(true);
    expect(isPreferredSupportTown({ x: 10, y: 10, distance: 2 }, { x: 12, y: 10, distance: 1 })).toBe(false);
    expect(isPreferredSupportTown({ x: 9, y: 10, distance: 1 }, { x: 12, y: 10, distance: 1 })).toBe(true);
    expect(isPreferredSupportTown({ x: 9, y: 10, distance: 1 }, undefined)).toBe(true);
  });
});
