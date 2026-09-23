import { describe, expect, it } from "vitest";
import { MS_PER_DAY, advanceProduction, dailyProductionRate, daysToComplete, startBuild } from "./galaxy-production-queue.js";

describe("dailyProductionRate", () => {
  it("uses the §23 rates and halves them for an Outpost", () => {
    expect(dailyProductionRate("INDUSTRIAL", "PLANET")).toBe(6);
    expect(dailyProductionRate("CAPITAL", "PLANET")).toBe(2);
    expect(dailyProductionRate("LOGISTICS", "OUTPOST")).toBe(2);
  });
});

describe("daysToComplete", () => {
  it("a 40-cost fleet at 16/day takes 3 days", () => {
    expect(daysToComplete(40, 16)).toBe(3);
  });
  it("is Infinity when the rate is zero", () => {
    expect(daysToComplete(80, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("advanceProduction", () => {
  const raider = { kind: "FLEET" as const, label: "Raider", cost: 80 };
  it("accrues progress at the daily rate and completes on time", () => {
    const started = startBuild({ slot: null }, raider);
    const half = advanceProduction(started, 6, 7 * MS_PER_DAY);
    expect(half.completed).toBeNull();
    expect(half.state.slot?.progress).toBeCloseTo(42);
    const done = advanceProduction(half.state, 6, 7 * MS_PER_DAY);
    expect(done.completed).toMatchObject({ label: "Raider", progress: 80 });
    expect(done.state.slot).toBeNull();
  });
  it("does nothing on an empty slot", () => {
    const empty = { slot: null };
    expect(advanceProduction(empty, 6, MS_PER_DAY)).toEqual({ state: empty, completed: null });
  });
  it("rejects a non-positive build cost", () => {
    expect(() => startBuild({ slot: null }, { kind: "FLEET", label: "x", cost: 0 })).toThrow();
  });
});
