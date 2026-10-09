import type { DomainPlayer } from "@border-empires/game-domain";
import { MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { effectiveManpowerAt } from "./runtime-manpower.js";
import { creditManpower, grantOverflowManpower, manpowerCeiling, settleWaystationManpowerOverflow } from "./runtime-manpower-ceiling.js";
import type { RuntimePlayer } from "./runtime-types.js";

const CAP = 720;
const player = (overrides: Partial<DomainPlayer> = {}): RuntimePlayer =>
  ({ id: "p1", isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set(), ...overrides }) as RuntimePlayer;

describe("waystation manpower overflow", () => {
  it("a refund does not erase waystation overflow (bare-cap clamp regression)", () => {
    const p = player({ manpower: CAP });
    grantOverflowManpower(p, 1_000, CAP);
    p.manpower -= 20; // spend on a settle...
    creditManpower(p, 20, CAP); // ...which is then refunded
    expect(p.manpower).toBe(CAP + 1_000);
  });

  it("without waystation overflow, refunds still clamp to the cap", () => {
    const p = player({ manpower: CAP - 5 });
    creditManpower(p, 50, CAP);
    expect(p.manpower).toBe(CAP);
    expect(manpowerCeiling(p, CAP)).toBe(CAP);
  });

  it("overflowed manpower holds without regen, and isn't clamped back to the cap", () => {
    const p = player({ manpower: CAP, manpowerUpdatedAt: 0 });
    grantOverflowManpower(p, 1_000, CAP);
    expect(effectiveManpowerAt(p, CAP, 10, 60 * 60_000)).toBe(CAP + 1_000);
  });

  it("spent overflow is gone for good; regen resumes under the cap and stops at the cap", () => {
    const p = player({ manpower: CAP, manpowerUpdatedAt: 0 });
    grantOverflowManpower(p, 1_000, CAP);
    p.manpower = 600; // spent below the cap
    settleWaystationManpowerOverflow(p, CAP);
    expect(p.waystationManpowerOverflow).toBeUndefined();
    expect(effectiveManpowerAt(p, CAP, 10, 2 * MANPOWER_REFILL_WINDOW_MS)).toBe(CAP); // 10/min over a whole window refills it
    creditManpower(p, 5_000, CAP);
    expect(p.manpower).toBe(CAP);
  });

  it("partial spend shrinks the allowance to what is still above the cap", () => {
    const p = player({ manpower: CAP });
    grantOverflowManpower(p, 1_000, CAP);
    p.manpower -= 400;
    settleWaystationManpowerOverflow(p, CAP);
    expect(p.waystationManpowerOverflow).toBe(600);
    creditManpower(p, 1_000, CAP);
    expect(p.manpower).toBe(CAP + 600);
  });

  it("a cap drop still clamps non-waystation manpower", () => {
    const p = player({ manpower: 700, manpowerUpdatedAt: 0 });
    expect(effectiveManpowerAt(p, 500, 10, 0)).toBe(500);
  });
});
