import { describe, expect, it } from "vitest";

import { scoreDecision, type DecisionInputs } from "./decisions.js";

/**
 * scoreBuildBeacon's gate, deliberately kept to three plain, individually
 * understandable conditions instead of a bundled precondition function
 * (the earlier version gated on isReachStarved, which combined five
 * unrelated checks — economic-target exhaustion, enemy presence, town
 * count, food, and a manpower floor — behind one opaque name; removed
 * entirely per explicit request, "I don't even understand that variable").
 */

const baseInputs: DecisionInputs = {
  points: 100,
  manpower: 500,
  canAttack: false,
  canExpand: true,
  frontierNeutralCount: 0,
  frontierEnemyCount: 0,
  frontierOpportunityEconomic: 0,
  expansionOpportunityCount: 0,
  nonWasteExpansionOpportunityCount: 0,
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
  frontPosture: "BREAK",
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  underThreat: false,
  needsEconomy: false,
  needsFood: false,
  hasEconomicBuild: false,
  hasFortBuild: false,
  hasSiegeOutpost: false,
  hasRelayBeaconBuild: true,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

describe("scoreBuildBeacon", () => {
  it("fires once a beacon site exists, a dev slot is free, and no enemy is at the frontier", () => {
    expect(scoreDecision("BUILD_BEACON", baseInputs)).toBeGreaterThan(0);
  });

  it("does not fire without a site (chooseBestRelayBeaconBuild found nothing)", () => {
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, hasRelayBeaconBuild: false })).toBe(0);
  });

  it("does not fire without a free development slot", () => {
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, devSlotAvailable: false })).toBe(0);
  });

  it("does not fire with an enemy at the frontier — fight first, build later", () => {
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, frontierEnemyCount: 3 })).toBe(0);
  });

  it("does not require an empty economy/manpower/food state — that used to be isReachStarved's job and is gone", () => {
    // A beacon site existing is already meaningful (chooseBestRelayBeaconBuild
    // requires it to newly cover real unowned land) — no separate
    // "starved" bar to also clear.
    const strongEmpire: DecisionInputs = {
      ...baseInputs,
      needsFood: true,
      needsEconomy: true,
      manpower: 10000,
      frontierOpportunityEconomic: 12 // plenty of valuable EXPAND targets still available too
    };
    expect(scoreDecision("BUILD_BEACON", strongEmpire)).toBeGreaterThan(0);
  });
});
