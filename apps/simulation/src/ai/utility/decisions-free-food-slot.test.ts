import { describe, expect, it } from "vitest";

import { scoreDecision, type DecisionInputs } from "./decisions.js";

/**
 * FREE_FOOD_SLOT: last-resort REMOVE_STRUCTURE when FOOD slots are fully
 * exhausted and there's no direct fix (a FARMSTEAD/WATERWORKS/GRANARY build)
 * available — see food-slot-relief.ts and automation-command-planner.ts's
 * needVector wiring.
 */
const baseInputs: DecisionInputs = {
  points: 100,
  manpower: 500,
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
  hasAnyExpandCandidate: false,
  hasAnyAttackCandidate: false,
  devSlotAvailable: true,
  attackReady: false,
  musterReady: false,
  frontPosture: "HOLD",
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  underThreat: false,
  needsEconomy: false,
  needsFood: true,
  hasEconomicBuild: false,
  hasFortBuild: false,
  hasSiegeOutpost: false,
  hasRelayBeaconBuild: false,
  relayBeaconSiteValue: 0,
  beaconBoostActive: false,
  foodSlotsExhausted: true,
  hasFoodSlotReliefCandidate: true,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

describe("scoreFreeFoodSlot", () => {
  it("fires once FOOD slots are exhausted, a dormant structure exists to remove, and no direct fix is available", () => {
    expect(scoreDecision("FREE_FOOD_SLOT", baseInputs)).toBeGreaterThan(0);
  });

  it("vetoes when FOOD slots aren't actually exhausted", () => {
    expect(scoreDecision("FREE_FOOD_SLOT", { ...baseInputs, foodSlotsExhausted: false })).toBe(0);
  });

  it("vetoes when there's no FOOD-dormant structure to remove", () => {
    expect(scoreDecision("FREE_FOOD_SLOT", { ...baseInputs, hasFoodSlotReliefCandidate: false })).toBe(0);
  });

  it("vetoes when a direct fix (BUILD_ECONOMY growing FOOD) is available — the direct fix always wins over demolition", () => {
    expect(scoreDecision("FREE_FOOD_SLOT", { ...baseInputs, hasEconomicBuild: true })).toBe(0);
  });

  it("vetoes while the core is under real attack pressure — don't demolish infrastructure mid-defense", () => {
    expect(scoreDecision("FREE_FOOD_SLOT", { ...baseInputs, pressureThreatensCore: true })).toBe(0);
  });
});
