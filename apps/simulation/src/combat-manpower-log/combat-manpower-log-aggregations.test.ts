import { describe, expect, it } from "vitest";

import { computeBiggestBattle24h, computeFiercestAttacker24h, computeManpowerLostTotal24h, computeToughestTarget24h } from "./combat-manpower-log-aggregations.js";
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

describe("computeFiercestAttacker24h", () => {
  it("returns null for an empty log", () => {
    expect(computeFiercestAttacker24h([], "barbarian-1")).toBeNull();
  });

  it("sums manpower spent per attacker across multiple attacks and returns the top spender", () => {
    const log = [
      loss({ attackerId: "p1", manpowerLoss: 10 }),
      loss({ attackerId: "p1", manpowerLoss: 15 }),
      loss({ attackerId: "p2", manpowerLoss: 20 })
    ];
    expect(computeFiercestAttacker24h(log, "barbarian-1")).toEqual({ attackerId: "p1", manpowerSpent: 25 });
  });

  // The whole reason this aggregation takes an exclusion id: barbarian-origin
  // attacks are rate-limited by tile cooldown, not manpower (see
  // runtime-lock-resolution.ts), so barbarians never actually pay for the
  // losses their attacks log here. Without this exclusion they would win
  // "Fiercest Attacker" essentially every day for free.
  it("excludes the given attacker id even when it would otherwise be the top spender", () => {
    const log = [
      loss({ attackerId: "barbarian-1", manpowerLoss: 1000 }),
      loss({ attackerId: "p1", manpowerLoss: 50 })
    ];
    expect(computeFiercestAttacker24h(log, "barbarian-1")).toEqual({ attackerId: "p1", manpowerSpent: 50 });
  });

  it("returns null when every attacker in the log is excluded", () => {
    const log = [loss({ attackerId: "barbarian-1", manpowerLoss: 1000 })];
    expect(computeFiercestAttacker24h(log, "barbarian-1")).toBeNull();
  });

  it("rounds the total, not each individual loss", () => {
    const log = [loss({ attackerId: "p1", manpowerLoss: 10.4 }), loss({ attackerId: "p1", manpowerLoss: 10.4 })];
    expect(computeFiercestAttacker24h(log, "barbarian-1")).toEqual({ attackerId: "p1", manpowerSpent: 21 }); // round(20.8), not 10+10
  });
});

describe("computeToughestTarget24h", () => {
  it("returns null for an empty log", () => {
    expect(computeToughestTarget24h([])).toBeNull();
  });

  it("sums manpower spent against each defender regardless of who won, and returns the top target", () => {
    const log = [
      loss({ defenderId: "p2", manpowerLoss: 10, attackerWon: true }),
      loss({ defenderId: "p2", manpowerLoss: 15, attackerWon: false }),
      loss({ defenderId: "p4", manpowerLoss: 5 })
    ];
    expect(computeToughestTarget24h(log)).toEqual({ defenderId: "p2", manpowerSpentAgainst: 25 });
  });

  it("does not count attacks on unclaimed land toward any defender", () => {
    const log = [loss({ defenderId: undefined, manpowerLoss: 500 }), loss({ defenderId: "p2", manpowerLoss: 5 })];
    expect(computeToughestTarget24h(log)).toEqual({ defenderId: "p2", manpowerSpentAgainst: 5 });
  });

  it("returns null when every attack in the log was on unclaimed land", () => {
    expect(computeToughestTarget24h([loss({ defenderId: undefined, manpowerLoss: 100 })])).toBeNull();
  });
});
