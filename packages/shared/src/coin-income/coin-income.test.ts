import { describe, expect, it } from "vitest";
import {
  EMPIRE_INTEGRITY_INCOME_LABEL,
  UNITEMISED_COIN_INCOME_LABEL,
  coinIncomeBreakdown,
  spendableCoin,
  formatCoinPerDay
} from "./coin-income.js";

const perMin = (perDay: number): number => perDay / 1440;
const total = (rows: readonly { amountPerMinute: number }[]): number => rows.reduce((sum, row) => sum + row.amountPerMinute, 0);

describe("coinIncomeBreakdown", () => {
  // Playtest: Towns 26.4 + AFC 10.0 listed, headline 40.9/day — the +12%
  // Integrity bonus was in the total but on no line.
  it("lists the Integrity bonus as its own last line, so the lines add up to the headline", () => {
    const view = coinIncomeBreakdown({
      incomePerMinute: perMin(40.768),
      upkeepGoldPerMinute: 0,
      sources: [
        { label: EMPIRE_INTEGRITY_INCOME_LABEL, amountPerMinute: perMin(4.368), count: 1 },
        { label: "Towns", amountPerMinute: perMin(26.4), count: 1 },
        { label: "Automated Fabrication Complex", amountPerMinute: perMin(10), count: 1 }
      ]
    });
    expect(view.earned.map((l) => l.label)).toEqual(["Towns", "Automated Fabrication Complex", EMPIRE_INTEGRITY_INCOME_LABEL]);
    expect(view.earned.at(-1)?.kind).toBe("bonus");
    expect(view.integrityPerMinute).toBeCloseTo(perMin(4.368), 9);
    expect(total(view.earned)).toBeCloseTo(view.grossPerMinute, 9);
    expect(formatCoinPerDay(view.netPerMinute)).toBe("+40.8/day");
  });

  it("shows any gap between the lines and the authoritative total as an Other line instead of hiding it", () => {
    const view = coinIncomeBreakdown({
      incomePerMinute: perMin(40.8),
      upkeepGoldPerMinute: 0,
      sources: [{ label: "Towns", amountPerMinute: perMin(36.4), count: 1 }]
    });
    expect(view.earned.at(-1)).toMatchObject({ label: UNITEMISED_COIN_INCOME_LABEL, kind: "other" });
    expect(total(view.earned)).toBeCloseTo(view.grossPerMinute, 9);
  });

  it("uses the fallback label for the single line before any source rows arrive", () => {
    const view = coinIncomeBreakdown({ incomePerMinute: perMin(12), upkeepGoldPerMinute: 0, fallbackLabel: "Live empire income" });
    expect(view.earned).toEqual([{ label: "Live empire income", amountPerMinute: perMin(12), count: 1, kind: "other" }]);
  });

  it("nets coin upkeep out of the headline and itemises only coin-paid upkeep", () => {
    const view = coinIncomeBreakdown({
      incomePerMinute: perMin(30),
      upkeepGoldPerMinute: perMin(5),
      sources: [{ label: "Towns", amountPerMinute: perMin(30), count: 2 }],
      sinks: [
        { label: "Clearing House", amountPerMinute: perMin(5), count: 1 },
        { label: "Umbrite Works", amountPerMinute: perMin(2), count: 1, resourceKey: "UMBRITE" }
      ]
    });
    expect(view.netPerMinute).toBeCloseTo(perMin(25), 9);
    expect(view.upkeep.map((l) => l.label)).toEqual(["Clearing House"]);
  });

  it("keeps a paused zero-amount source visible without changing the total", () => {
    const view = coinIncomeBreakdown({ incomePerMinute: 0, upkeepGoldPerMinute: 0, sources: [{ label: "Towns", amountPerMinute: 0, count: 7 }] });
    expect(view.earned).toEqual([{ label: "Towns", amountPerMinute: 0, count: 7, kind: "source" }]);
  });

  it("formats a penalty with a minus sign", () => {
    expect(formatCoinPerDay(perMin(-2))).toBe("−2.0/day");
  });
});

describe("spendableCoin", () => {
  it("rounds a fractional balance down to whole coin", () => {
    expect(spendableCoin(11.6)).toBe(11);
    expect(spendableCoin(12)).toBe(12);
    // The server rejects a 12-coin payment from 11.9999995, so it must not read 12.
    expect(spendableCoin(11.9999995)).toBe(11);
    expect(spendableCoin(-0.4)).toBe(-1);
    expect(spendableCoin(Number.NaN)).toBe(0);
  });
});
