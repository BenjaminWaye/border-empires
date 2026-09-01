import { describe, expect, it } from "vitest";

import { computeBiggestBattle24h, computeManpowerLostTotal24h } from "./combat-manpower-log-aggregations.js";
import type { CombatManpowerLoss } from "./combat-manpower-log.js";

const loss = (overrides: Partial<CombatManpowerLoss> = {}): CombatManpowerLoss => ({
  attackerId: "p1",
  defenderId: "p2",
  attackerWon: true,
  manpowerLoss: 10,
  x: 1,
  y: 1,
  at: 0,
  ...overrides
});

describe("computeManpowerLostTotal24h", () => {
  it("returns 0 for an empty log", () => {
    expect(computeManpowerLostTotal24h([])).toBe(0);
  });

  it("sums manpower lost across every entry, regardless of attacker", () => {
    const log = [loss({ manpowerLoss: 10 }), loss({ manpowerLoss: 15.4, attackerId: "p3" }), loss({ manpowerLoss: 2 })];
    expect(computeManpowerLostTotal24h(log)).toBe(27); // rounded, not truncated
  });
});

describe("computeBiggestBattle24h", () => {
  it("returns null for an empty log", () => {
    expect(computeBiggestBattle24h([])).toBeNull();
  });

  it("returns the single costliest attack by manpower lost", () => {
    const log = [
      loss({ attackerId: "p1", manpowerLoss: 10, at: 100 }),
      loss({ attackerId: "p3", defenderId: "p4", manpowerLoss: 61.2, x: 128, y: 44, at: 500, attackerWon: false }),
      loss({ attackerId: "p5", manpowerLoss: 5, at: 900 })
    ];
    expect(computeBiggestBattle24h(log)).toEqual({
      attackerId: "p3",
      defenderId: "p4",
      attackerWon: false,
      manpowerLoss: 61,
      x: 128,
      y: 44,
      at: 500
    });
  });

  it("preserves an undefined defenderId for an attack on unclaimed land", () => {
    const log = [loss({ defenderId: undefined, manpowerLoss: 8 })];
    expect(computeBiggestBattle24h(log)!.defenderId).toBeUndefined();
  });
});
