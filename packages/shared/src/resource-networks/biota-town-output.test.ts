import { describe, expect, it } from "vitest";
import { biotaAdjustedTownManpower, biotaBlend, biotaShareMet } from "./biota-town-output.js";
import { terrainAdjustedTownManpower } from "../town-terrain-profile.js";

describe("partial luxury biota", () => {
  it("measures the share of a town's need that is met", () => {
    expect(biotaShareMet(undefined)).toBe(1);
    expect(biotaShareMet({ received: 0, needed: 0 })).toBe(1);
    expect(biotaShareMet({ received: 4, needed: 6 })).toBeCloseTo(2 / 3);
    expect(biotaShareMet({ received: 9, needed: 6 })).toBe(1);
  });
  it("gives a short town manpower in proportion to its share, from Town up to its own tier", () => {
    const town = terrainAdjustedTownManpower("TOWN", undefined);
    const metro = terrainAdjustedTownManpower("METROPOLIS", undefined);
    const partial = biotaAdjustedTownManpower("METROPOLIS", undefined, false, { received: 3, needed: 6 });
    expect(partial.cap).toBeCloseTo((town.cap + metro.cap) / 2);
    expect(partial.regenPerMinute).toBeCloseTo((town.regenPerMinute + metro.regenPerMinute) / 2);
    expect(biotaAdjustedTownManpower("METROPOLIS", undefined, false, { received: 0, needed: 6 })).toEqual(town);
    expect(biotaAdjustedTownManpower("METROPOLIS", undefined, false, { received: 6, needed: 6 })).toEqual(metro);
    expect(biotaBlend(1, 2.1, 0.5)).toBeCloseTo(1.55);
  });
});
