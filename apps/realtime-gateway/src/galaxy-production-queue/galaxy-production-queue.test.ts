import { describe, expect, it } from "vitest";
import { dailyProductionRate, daysToComplete } from "./galaxy-production-queue.js";

describe("dailyProductionRate", () => {
  it("uses the §23 rates and halves them for an Outpost", () => {
    expect(dailyProductionRate("INDUSTRIAL", "PLANET")).toBe(6);
    expect(dailyProductionRate("CAPITAL", "PLANET")).toBe(2);
    expect(dailyProductionRate("LOGISTICS", "OUTPOST")).toBe(2);
  });
});

describe("daysToComplete", () => {
  it("a 40-cost build at 16/day takes 3 days; a Fighter takes 14 at 6/day and 40 at 2/day", () => {
    expect(daysToComplete(40, 16)).toBe(3);
    expect(daysToComplete(80, 6)).toBe(14);
    expect(daysToComplete(80, 2)).toBe(40);
  });
  it("is Infinity when the rate is zero", () => {
    expect(daysToComplete(80, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
