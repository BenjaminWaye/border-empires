import { describe, expect, it } from "vitest";
import { forcedAncillarificationQuote } from "./forced-ancillarification.js";

describe("Forced Ancillarification balance", () => {
  it("keeps the sacrifice proportional as towns grow while granting a fixed reserve", () => {
    expect(forcedAncillarificationQuote(20_000)).toEqual({ populationCost: 2000, manpower: 100, available: true });
    expect(forcedAncillarificationQuote(1_000_000)).toEqual({ populationCost: 100_000, manpower: 100, available: true });
    expect(forcedAncillarificationQuote(20_001).populationCost).toBe(2001);
  });
  it("protects the minimum town population and rejects invalid values", () => {
    expect(forcedAncillarificationQuote(11_111).available).toBe(false);
    expect(forcedAncillarificationQuote(11_112).available).toBe(true);
    for (const population of [0, -1, NaN, Infinity]) expect(forcedAncillarificationQuote(population).available).toBe(false);
  });
});
