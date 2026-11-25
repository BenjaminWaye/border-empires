import { describe, expect, it } from "vitest";
import { townSupportCoinLines } from "./client-town-support-coin.js";

describe("townSupportCoinLines", () => {
  // Owner rule 2026-11-24: the inner ring carries the base coin, the outer ring the City bonus.
  it("names the outer ring's cut of the tier bonus, not a cut of the whole coin", () => {
    const lines = townSupportCoinLines({ populationTier: "CITY", supportCurrent: 8, supportMax: 24, supportInnerCurrent: 8, supportInnerMax: 8 });
    expect(lines).toEqual([{ label: "Outer plots 0/16", effectPct: expect.closeTo(-20, 5) }]);
  });

  it("names a short inner ring by its share, and nothing when every plot is held", () => {
    expect(townSupportCoinLines({ populationTier: "TOWN", supportCurrent: 4, supportMax: 8, supportInnerCurrent: 4, supportInnerMax: 8 }))
      .toEqual([{ label: "Inner plots 4/8", effectPct: -50 }]);
    expect(townSupportCoinLines({ populationTier: "CITY", supportCurrent: 24, supportMax: 24, supportInnerCurrent: 8, supportInnerMax: 8 })).toEqual([]);
  });
});
