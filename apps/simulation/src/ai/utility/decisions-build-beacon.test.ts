import { describe, expect, it } from "vitest";

import { scoreDecision, type DecisionInputs } from "./decisions.js";

/**
 * scoreBuildBeacon's gate, deliberately kept to plain, individually
 * understandable conditions instead of a bundled precondition function
 * (the earlier version gated on isReachStarved, which combined five
 * unrelated checks — economic-target exhaustion, enemy presence, town
 * count, food, and a manpower floor — behind one opaque name; removed
 * entirely per explicit request, "I don't even understand that variable").
 */

// relayBeaconSiteValue well above RELAY_BEACON_SITE_VALUE_CEILING (24 in
// decisions.ts) — a comfortably rich site, so these fixtures aren't
// accidentally testing the graduated-value boundary itself (see the
// dedicated "graduated on site value" describe block below for that).
const RICH_SITE_VALUE = 32;

const baseInputs: DecisionInputs = {
  points: 100,
  manpower: 500,
  canAttack: false,
  canExpand: true,
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
  relayBeaconSiteValue: RICH_SITE_VALUE,
  beaconBoostActive: false,
  foodSlotsExhausted: false,
  hasFoodSlotReliefCandidate: false,
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

// Regression for the reach-consideration work
// (docs/ai-structure-building-rewrite-plan.md): before this, "a beacon site
// exists" was a plain boolVeto, so a beacon reaching one empty tile and one
// reaching three towns and a dock scored identically (both 1.0 once
// unvetoed). relayBeaconSiteValue makes that graduated instead.
describe("scoreBuildBeacon — graduated on site value", () => {
  it("does not fire for a site whose only value is a single plain LAND tile (the floor)", () => {
    // relayBeaconSiteValue: 1 is RELAY_BEACON_SITE_VALUE_FLOOR itself — the
    // smallest value chooseBestRelayBeaconBuild's own newCoverage.score>0
    // veto ever lets through. linear(1, 1, 24) is exactly 0, collapsing the
    // whole product to 0 via scoreConsiderations' short-circuit.
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: 1 })).toBe(0);
  });

  it("scores a mediocre site lower than a rich one", () => {
    const mediocre = scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: 6 });
    const rich = scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: RICH_SITE_VALUE });
    expect(mediocre).toBeGreaterThan(0);
    expect(mediocre).toBeLessThan(rich);
  });

  it("caps out at the ceiling — an extremely rich site scores the same as a merely rich one", () => {
    const rich = scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: RICH_SITE_VALUE });
    const extraordinary = scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: RICH_SITE_VALUE * 10 });
    expect(extraordinary).toBe(rich);
  });
});

// docs/ai-structure-building-rewrite-plan.md §16 / ai-beacon-cadence.ts: for
// 4 consecutive completed builds, BUILD_BEACON gets a flat additive bonus on
// top of the graduated site-value score above; the 5th build in the cycle
// gets none.
describe("scoreBuildBeacon — cadence boost", () => {
  it("scores a mediocre site higher when the cadence boost is active", () => {
    const mediocre = { ...baseInputs, relayBeaconSiteValue: 6 };
    const unboosted = scoreDecision("BUILD_BEACON", mediocre);
    const boosted = scoreDecision("BUILD_BEACON", { ...mediocre, beaconBoostActive: true });
    expect(boosted).toBeGreaterThan(unboosted);
  });

  it("never revives a vetoed beacon — the boost cannot overcome a missing site, dev slot, or frontier enemy", () => {
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, hasRelayBeaconBuild: false, beaconBoostActive: true })).toBe(0);
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, devSlotAvailable: false, beaconBoostActive: true })).toBe(0);
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, frontierEnemyCount: 3, beaconBoostActive: true })).toBe(0);
    // Site value at the floor (linear() = 0) is also still a hard 0, even boosted.
    expect(scoreDecision("BUILD_BEACON", { ...baseInputs, relayBeaconSiteValue: 1, beaconBoostActive: true })).toBe(0);
  });

  it("still caps at 1 — the boost cannot push an already-rich site's score past the ceiling", () => {
    const rich = { ...baseInputs, relayBeaconSiteValue: RICH_SITE_VALUE };
    expect(scoreDecision("BUILD_BEACON", { ...rich, beaconBoostActive: true })).toBeLessThanOrEqual(1);
  });
});
