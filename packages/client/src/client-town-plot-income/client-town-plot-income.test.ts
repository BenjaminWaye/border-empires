import { describe, expect, it } from "vitest";
import { townCoinNote, townPlotIncomeNote } from "./client-town-plot-income.js";

// 2026-11-14 playtest: a town read "Fed" at +0 coin/day, and nothing said its support plots were ungarrisoned.
describe("town plot income note", () => {
  it("names ungarrisoned plots on a fed town's coin line", () => {
    expect(townCoinNote({ isFed: true, supportCurrent: 0, supportMax: 4, populationTier: "TOWN" })).toBe("Fed · 0/4 plots garrisoned");
    expect(townCoinNote({ isFed: true, supportCurrent: 4, supportMax: 4, populationTier: "TOWN" })).toBe("Fed");
  });

  it("leaves unfed, settlement and unknown towns alone", () => {
    expect(townCoinNote({ isFed: false, supportCurrent: 0, supportMax: 4, populationTier: "TOWN" })).toBe("Unfed");
    expect(townPlotIncomeNote({ isFed: true, supportCurrent: 0, supportMax: 4, populationTier: "SETTLEMENT" })).toBeUndefined();
    expect(townPlotIncomeNote({ isFed: true, populationTier: "TOWN" })).toBeUndefined();
    expect(townCoinNote({})).toBe("");
  });
});
