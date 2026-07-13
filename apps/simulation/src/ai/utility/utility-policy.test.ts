import { describe, expect, it } from "vitest";

import { boolVeto, clamp01, compensate, linear, logistic, quadratic, scoreConsiderations } from "./considerations.js";
import { type DecisionInputs, scoreDecision } from "./decisions.js";
import { evaluateUtilityPolicy } from "./utility-policy.js";

// ── Base inputs ──────────────────────────────────────────────────────────────
// A neutral starting state: modest gold, no threats, no opportunities.
const BASE: DecisionInputs = {
  points: 80,
  manpower: 10,
  canAttack: false,
  canExpand: false,
  frontierNeutralCount: 0,
  frontierEnemyCount: 0,
  frontierOpportunityEconomic: 0,
  expansionOpportunityCount: 0,
  hasActionableNonWasteExpand: false,
  hasExpansionObjective: false,
  hasOnlyScoutExpand: false,
  hasWeakEnemyBorder: false,
  hasBarbTarget: false,
  devSlotAvailable: true,
  attackReady: false,
  musterReady: false,
  frontPosture: "TRUCE",
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  underThreat: false,
  needsEconomy: false,
  needsFood: false,
  hasEconomicBuild: false,
  hasFortBuild: false,
  hasSiegeOutpost: false,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

// ── Response curve tests ─────────────────────────────────────────────────────

describe("clamp01", () => {
  it("clamps below 0", () => expect(clamp01(-5)).toBe(0));
  it("clamps above 1", () => expect(clamp01(2)).toBe(1));
  it("passes through midpoint", () => expect(clamp01(0.5)).toBe(0.5));
});

describe("linear", () => {
  it("returns 0 at min", () => expect(linear(0, 0, 10)).toBe(0));
  it("returns 1 at max", () => expect(linear(10, 0, 10)).toBe(1));
  it("returns 0.5 at midpoint", () => expect(linear(5, 0, 10)).toBe(0.5));
  it("clamps below range", () => expect(linear(-1, 0, 10)).toBe(0));
  it("clamps above range", () => expect(linear(20, 0, 10)).toBe(1));
  it("handles equal min/max: x < max → 0", () => expect(linear(4, 5, 5)).toBe(0));
  it("handles equal min/max: x >= max → 1", () => expect(linear(5, 5, 5)).toBe(1));
});

describe("logistic", () => {
  it("returns ~0.5 at midpoint", () => expect(logistic(10, 10, 1)).toBeCloseTo(0.5, 2));
  it("positive steepness rises left-to-right", () => {
    expect(logistic(20, 10, 1)).toBeGreaterThan(0.5);
    expect(logistic(0, 10, 1)).toBeLessThan(0.5);
  });
  it("negative steepness falls left-to-right", () => {
    expect(logistic(20, 10, -1)).toBeLessThan(0.5);
    expect(logistic(0, 10, -1)).toBeGreaterThan(0.5);
  });
  it("stays in [0,1]", () => {
    expect(logistic(1000, 10, 1)).toBeLessThanOrEqual(1);
    expect(logistic(-1000, 10, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe("quadratic", () => {
  it("returns 0 at min, 1 at max", () => {
    expect(quadratic(0, 0, 10)).toBe(0);
    expect(quadratic(10, 0, 10)).toBe(1);
  });
  it("is slower than linear near min", () =>
    expect(quadratic(2, 0, 10)).toBeLessThan(linear(2, 0, 10)));
});

describe("boolVeto", () => {
  it("true → 1", () => expect(boolVeto(true)).toBe(1));
  it("false → 0", () => expect(boolVeto(false)).toBe(0));
});

// ── Compensation tests ───────────────────────────────────────────────────────

describe("compensate", () => {
  it("n=1 is a no-op", () => expect(compensate(0.9, 1)).toBe(0.9));
  it("raises score above the raw product for n>1", () => {
    const product = 0.9 * 0.9; // 0.81
    expect(compensate(product, 2)).toBeGreaterThan(product);
  });
  it("does not raise a 0 product (vetoed)", () => expect(compensate(0, 4)).toBe(0));
  it("does not raise a 1 product", () => expect(compensate(1, 4)).toBe(1));
  it("n=8 @ 0.9 each: compensated >> raw product", () => {
    const raw = 0.9 ** 8; // ~0.43
    expect(compensate(raw, 8)).toBeGreaterThan(0.6);
  });
});

describe("scoreConsiderations", () => {
  it("empty array → 0", () => expect(scoreConsiderations([])).toBe(0));
  it("single veto → 0", () => expect(scoreConsiderations([0.9, 0, 0.8])).toBe(0));
  it("all 1s → 1 (compensation of 1 is 1)", () =>
    expect(scoreConsiderations([1, 1, 1])).toBe(1));
  it("short-circuits on 0 and skips remaining considerations", () =>
    expect(scoreConsiderations([1, 0, NaN])).toBe(0));
});

// ── Decision scoring tests ───────────────────────────────────────────────────

describe("EXPAND decision", () => {
  it("vetoed when can't expand (no gold)", () => {
    const s = scoreDecision("EXPAND", { ...BASE, canExpand: false });
    expect(s).toBe(0);
  });
  it("vetoed when no frontier opportunity", () => {
    const s = scoreDecision("EXPAND", {
      ...BASE,
      canExpand: true,
      frontierNeutralCount: 0,
      frontierOpportunityEconomic: 0
    });
    expect(s).toBe(0);
  });
  it("scores > 0 with gold and actionable frontier", () => {
    const s = scoreDecision("EXPAND", {
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 3
    });
    expect(s).toBeGreaterThan(0);
  });
  it("core-threatened expand still works when economic opportunity exists", () => {
    const s = scoreDecision("EXPAND", {
      ...BASE,
      canExpand: true,
      pressureThreatensCore: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 3,
      frontierOpportunityEconomic: 2
    });
    expect(s).toBeGreaterThan(0);
  });
  it("core-threatened expand heavily penalized when few opportunities", () => {
    // With the soft-penalty system, core-threatened expansion is not
    // hard-vetoed but is heavily suppressed via logistic scoring.
    const penalized = scoreDecision("EXPAND", {
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 1,
      pressureThreatensCore: true,
      pressureAttackScore: 500
    });
    const unpenalized = scoreDecision("EXPAND", {
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 1,
      pressureThreatensCore: false
    });
    expect(penalized).toBeGreaterThan(0);
    expect(penalized).toBeLessThan(unpenalized);
  });
});

describe("ATTACK decision", () => {
  it("vetoed when not attackReady", () => {
    const s = scoreDecision("ATTACK", { ...BASE, canAttack: true, attackReady: false });
    expect(s).toBe(0);
  });
  it("vetoed when muster can engage (musterReady + weak enemy-player border)", () => {
    const s = scoreDecision("ATTACK", {
      ...BASE,
      canAttack: true,
      attackReady: true,
      musterReady: true,
      hasWeakEnemyBorder: true,
      frontierEnemyCount: 1,
      frontPosture: "BREAK",
      pressureAttackScore: 300
    });
    expect(s).toBe(0);
  });
  it("NOT vetoed on a barbarian-only front even when musterReady (muster can't engage barbs)", () => {
    // Regression: ATTACK↔MUSTER deadlock. musterReady but no enemy-player
    // border (hasWeakEnemyBorder=false) means MUSTER vetoes, so ATTACK must
    // still fire against the barbarian target instead of both idling.
    const s = scoreDecision("ATTACK", {
      ...BASE,
      canAttack: true,
      attackReady: true,
      musterReady: true,
      hasWeakEnemyBorder: false,
      hasBarbTarget: true,
      frontPosture: "BREAK",
      pressureAttackScore: 300
    });
    expect(s).toBeGreaterThan(0);
  });
  // stalemate is folded into canAttack (buildDecisionInputs), not a
  // separate ATTACK veto. When stalemated, canAttack becomes false and
  // ATTACK scores 0 via the canAttack veto. MUSTER independently vetos on stalemate.
  it("vetoed when stalemated (via canAttack=false)", () => {
    const s = scoreDecision("ATTACK", {
      ...BASE,
      canAttack: false,
      attackReady: true,
      frontierEnemyCount: 1,
      frontPosture: "BREAK",
      pressureAttackScore: 300,
      stalemated: true
    });
    expect(s).toBe(0);
  });
  it("MUSTER is vetoed by stalemate", () => {
    const s = scoreDecision("MUSTER", {
      ...BASE,
      musterReady: true,
      hasWeakEnemyBorder: true,
      pressureAttackScore: 200,
      stalemated: true
    });
    expect(s).toBe(0);
  });
  it("scores > 0 when all conditions met", () => {
    const s = scoreDecision("ATTACK", {
      ...BASE,
      canAttack: true,
      attackReady: true,
      frontierEnemyCount: 1,
      frontPosture: "BREAK",
      pressureAttackScore: 250
    });
    expect(s).toBeGreaterThan(0);
  });
});

describe("BUILD_ECONOMY decision", () => {
  it("vetoed when no economic build available", () => {
    const s = scoreDecision("BUILD_ECONOMY", { ...BASE, hasEconomicBuild: false });
    expect(s).toBe(0);
  });

  // Core guarantee from the Phase 0 plan: BUILD_ECONOMY must never beat
  // EXPAND or ATTACK when a genuine frontier opportunity is present.
  it("scores less than EXPAND when actionable frontier exists", () => {
    const inp: DecisionInputs = {
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 3,
      hasEconomicBuild: true,
      needsEconomy: true
    };
    const expand = scoreDecision("EXPAND", inp);
    const economy = scoreDecision("BUILD_ECONOMY", inp);
    expect(expand).toBeGreaterThan(economy);
  });

  it("scores less than ATTACK when attack is ready with high pressure", () => {
    const inp: DecisionInputs = {
      ...BASE,
      canAttack: true,
      attackReady: true,
      frontierEnemyCount: 2,
      frontPosture: "BREAK",
      pressureAttackScore: 300,
      hasEconomicBuild: true,
      needsEconomy: true
    };
    const attack = scoreDecision("ATTACK", inp);
    const economy = scoreDecision("BUILD_ECONOMY", inp);
    expect(attack).toBeGreaterThan(economy);
  });

  it("can win when no frontier opportunity and economy is weak", () => {
    const s = scoreDecision("BUILD_ECONOMY", {
      ...BASE,
      hasEconomicBuild: true,
      needsEconomy: true,
      frontierNeutralCount: 0,
      frontierEnemyCount: 0
    });
    expect(s).toBeGreaterThan(0);
  });
});

// ── Policy evaluation tests ──────────────────────────────────────────────────

describe("evaluateUtilityPolicy", () => {
  it("returns WAIT when everything is vetoed", () => {
    const result = evaluateUtilityPolicy(BASE);
    expect(result.winner).toBe("WAIT");
  });

  it("winner has the highest score", () => {
    const result = evaluateUtilityPolicy({
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 4
    });
    const max = Math.max(...Object.values(result.scores));
    expect(result.winnerScore).toBeCloseTo(max, 6);
  });

  it("runner-up has the second-highest score", () => {
    const result = evaluateUtilityPolicy({
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 4
    });
    expect(result.runnerUpScore).toBeLessThanOrEqual(result.winnerScore);
  });

  it("WAIT score ≥ WAIT_FLOOR when no other class fires", () => {
    const result = evaluateUtilityPolicy(BASE);
    expect(result.scores["WAIT"]).toBeGreaterThanOrEqual(0.05);
  });

  it("EXPAND beats BUILD_ECONOMY in policy with actionable frontier + weak economy", () => {
    const result = evaluateUtilityPolicy({
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 3,
      hasEconomicBuild: true,
      needsEconomy: true
    });
    expect(result.winner).toBe("EXPAND");
  });

  it("vetoedClasses lists all zero-scored non-WAIT classes", () => {
    const result = evaluateUtilityPolicy(BASE);
    for (const cls of result.vetoedClasses) {
      expect(result.scores[cls]).toBe(0);
    }
  });

  it("momentum ticks boost a class but cannot rescue a vetoed one", () => {
    const vetoed = evaluateUtilityPolicy({
      ...BASE,
      canExpand: false,
      momentumTicks: { EXPAND: 10 } // lots of momentum, but can't expand
    });
    expect(vetoed.scores["EXPAND"]).toBe(0);

    // expansionOpportunityCount: 1 (not 3) keeps the base score under the
    // [0,1] ceiling so there's headroom left for momentum to actually boost it.
    const boosted = evaluateUtilityPolicy({
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 1,
      momentumTicks: { EXPAND: 5 }
    });
    const unboosted = evaluateUtilityPolicy({
      ...BASE,
      canExpand: true,
      hasActionableNonWasteExpand: true,
      expansionOpportunityCount: 1,
      momentumTicks: {}
    });
    expect(boosted.scores["EXPAND"]).toBeGreaterThan(unboosted.scores["EXPAND"]);
  });
});
