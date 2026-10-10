import { describe, expect, it } from "vitest";
import { lastManpowerRefillAtMs, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { accrueManpower } from "./runtime-manpower.js";
import type { RuntimePlayer } from "./runtime-types.js";

const MINUTE = 60_000;
const CAP = 720;
const ID = "p1";
const BOUNDARY = lastManpowerRefillAtMs(ID, 40 * MANPOWER_REFILL_WINDOW_MS + 5_000_000);
const NEXT = BOUNDARY + MANPOWER_REFILL_WINDOW_MS;

const player = (overrides: Partial<RuntimePlayer>): RuntimePlayer =>
  ({ id: ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set(), ...overrides }) as RuntimePlayer;

/** Settle like refreshManpowerOnlyForPlayer does: store the result and move the anchor to now. */
const settle = (p: RuntimePlayer, rate: number, nowMs: number): void => {
  const { manpower, banked } = accrueManpower(p, CAP, rate, nowMs);
  p.manpower = manpower;
  p.manpowerBanked = banked;
  p.manpowerUpdatedAt = nowMs;
};

describe("accrueManpower (banked periodic refill)", () => {
  it("banks regen mid-window without making it spendable", () => {
    const result = accrueManpower(player({ manpowerUpdatedAt: BOUNDARY }), CAP, 1, BOUNDARY + 60 * MINUTE);
    expect(result).toEqual({ manpower: 0, banked: 60 });
  });

  it("releases the whole bank at the boundary and starts banking the new window", () => {
    const p = player({ manpowerUpdatedAt: BOUNDARY });
    settle(p, 1, BOUNDARY + 60 * MINUTE);
    const result = accrueManpower(p, CAP, 1, NEXT + 10 * MINUTE);
    expect(result.manpower).toBeCloseTo(240, 9);
    expect(result.banked).toBeCloseTo(10, 9);
  });

  it("applies the Iron Levy regen freeze only while it is active (regression: it used to zero or skip the whole window)", () => {
    const p = player({ manpowerUpdatedAt: BOUNDARY });
    settle(p, 1, BOUNDARY + 60 * MINUTE); // 60 banked at full rate
    settle(p, 0, BOUNDARY + 180 * MINUTE); // 2h freeze: nothing banked
    const result = accrueManpower(p, CAP, 1, NEXT); // freeze over for the last hour
    expect(result.manpower).toBeCloseTo(60 + 60, 9);
  });

  it("does not lose the window when the freeze is still active at the boundary", () => {
    const p = player({ manpowerUpdatedAt: BOUNDARY });
    settle(p, 1, BOUNDARY + 200 * MINUTE); // 200 banked before the freeze starts
    expect(accrueManpower(p, CAP, 0, NEXT + MINUTE).manpower).toBeCloseTo(200, 9);
  });

  it("applies a regen increase only from when it happened, not to the whole window", () => {
    const p = player({ manpowerUpdatedAt: BOUNDARY });
    settle(p, 1, BOUNDARY + 230 * MINUTE); // a regen structure finishes 10 minutes before the refill
    expect(accrueManpower(p, CAP, 10, NEXT).manpower).toBeCloseTo(230 + 100, 9);
  });

  it("never banks past the room left under the cap, and banks nothing while full", () => {
    expect(accrueManpower(player({ manpower: 700, manpowerUpdatedAt: BOUNDARY }), CAP, 1, BOUNDARY + 100 * MINUTE).banked).toBe(20);
    expect(accrueManpower(player({ manpower: CAP, manpowerUpdatedAt: BOUNDARY, manpowerBanked: 50 }), CAP, 1, NEXT - MINUTE)).toEqual({ manpower: CAP, banked: 0 });
  });

  it("pays out everything owed after a long absence, capped at the cap", () => {
    const result = accrueManpower(player({ manpowerUpdatedAt: BOUNDARY - 10 * MANPOWER_REFILL_WINDOW_MS }), CAP, 1, BOUNDARY + MINUTE);
    expect(result.manpower).toBe(CAP);
    expect(result.banked).toBe(0);
  });
});
