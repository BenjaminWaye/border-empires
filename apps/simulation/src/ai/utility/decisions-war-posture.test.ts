/**
 * Regression cover for WAR front posture's decision-scoring effects
 * (docs/ai-war-peace-balance-plan.md, Phase 3).
 */
import { describe, expect, it } from "vitest";

import { type DecisionInputs, scoreDecision } from "./decisions.js";

const BASE: DecisionInputs = {
  points: 80,
  manpower: 100,
  canAttack: true,
  canExpand: true,
  frontierNeutralCount: 0,
  frontierEnemyCount: 1,
  frontierOpportunityEconomic: 0,
  expansionOpportunityCount: 3,
  hasActionableNonWasteExpand: true,
  hasExpansionObjective: false,
  hasOnlyScoutExpand: false,
  hasWeakEnemyBorder: false,
  hasBarbTarget: true,
  hasAnyExpandCandidate: true,
  hasAnyAttackCandidate: true,
  devSlotAvailable: true,
  attackReady: true,
  musterReady: false,
  frontPosture: "WAR",
  pressureAttackScore: 200,
  pressureThreatensCore: true,
  underThreat: true,
  needsEconomy: false,
  needsFood: false,
  hasEconomicBuild: true,
  hasFortBuild: true,
  hasSiegeOutpost: false,
  hasRelayBeaconBuild: true,
  relayBeaconSiteValue: 20,
  beaconBoostActive: false,
  foodSlotsExhausted: false,
  hasFoodSlotReliefCandidate: false,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

describe("EXPAND under WAR posture", () => {
  it("vetoes an otherwise-actionable non-waste expand without an objective", () => {
    expect(scoreDecision("EXPAND", BASE)).toBe(0);
  });

  it("fires once an expansion objective is set, even without hasActionableNonWasteExpand", () => {
    const s = scoreDecision("EXPAND", { ...BASE, hasActionableNonWasteExpand: false, hasExpansionObjective: true });
    expect(s).toBeGreaterThan(0);
  });

  it("is unaffected outside WAR posture — plain actionable expand still fires", () => {
    const s = scoreDecision("EXPAND", { ...BASE, frontPosture: "BREAK" });
    expect(s).toBeGreaterThan(0);
  });
});

describe("BUILD_ECONOMY under WAR posture", () => {
  it("is suppressed to near-zero without a genuine economic emergency", () => {
    const atWar = scoreDecision("BUILD_ECONOMY", BASE);
    const notAtWar = scoreDecision("BUILD_ECONOMY", { ...BASE, frontPosture: "BREAK" });
    expect(atWar).toBeGreaterThan(0);
    expect(atWar).toBeLessThan(notAtWar * 0.1);
  });

  it("is not suppressed when needsEconomy holds — a real emergency overrides the near-veto", () => {
    const emergency = scoreDecision("BUILD_ECONOMY", { ...BASE, needsEconomy: true });
    const noEmergencyAtWar = scoreDecision("BUILD_ECONOMY", BASE);
    expect(emergency).toBeGreaterThan(noEmergencyAtWar);
  });

  it("is not suppressed when needsFood holds either", () => {
    const emergency = scoreDecision("BUILD_ECONOMY", { ...BASE, needsFood: true });
    const noEmergencyAtWar = scoreDecision("BUILD_ECONOMY", BASE);
    expect(emergency).toBeGreaterThan(noEmergencyAtWar);
  });
});

describe("ATTACK and BUILD_DEFENSE boosted under WAR posture", () => {
  it("scores ATTACK higher at WAR than an equivalent non-WAR posture", () => {
    const atWar = scoreDecision("ATTACK", BASE);
    const notAtWar = scoreDecision("ATTACK", { ...BASE, frontPosture: "BREAK" });
    expect(atWar).toBeGreaterThan(notAtWar);
  });

  it("scores BUILD_DEFENSE higher at WAR than an equivalent non-WAR posture", () => {
    const atWar = scoreDecision("BUILD_DEFENSE", BASE);
    const notAtWar = scoreDecision("BUILD_DEFENSE", { ...BASE, frontPosture: "BREAK" });
    expect(atWar).toBeGreaterThan(notAtWar);
  });

  it("the WAR boost cannot revive an ATTACK that's still illegal (no candidate)", () => {
    expect(scoreDecision("ATTACK", { ...BASE, hasAnyAttackCandidate: false })).toBe(0);
  });

  it("the WAR boost cannot revive a BUILD_DEFENSE that's still illegal (no fort/siege build)", () => {
    expect(scoreDecision("BUILD_DEFENSE", { ...BASE, hasFortBuild: false, hasSiegeOutpost: false })).toBe(0);
  });
});

describe("BUILD_BEACON's frontier-enemy veto is waived under WAR posture", () => {
  it("still fires with a frontier enemy present, when at WAR", () => {
    expect(scoreDecision("BUILD_BEACON", BASE)).toBeGreaterThan(0);
  });

  it("stays vetoed by a frontier enemy outside WAR posture", () => {
    expect(scoreDecision("BUILD_BEACON", { ...BASE, frontPosture: "BREAK" })).toBe(0);
  });

  it("is unaffected when there's no frontier enemy at all, WAR or not", () => {
    const s = scoreDecision("BUILD_BEACON", { ...BASE, frontierEnemyCount: 0, frontPosture: "BREAK" });
    expect(s).toBeGreaterThan(0);
  });
});
