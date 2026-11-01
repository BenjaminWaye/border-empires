import { describe, expect, it } from "vitest";

import { DECISION_CLASSES, scoreDecision, type DecisionClass, type DecisionInputs } from "./decisions.js";
import { primaryWaitReason, vetoReasonsFor, type WaitContext } from "./wait-reasons.js";

// A reach-capped empire with nothing in reach: the shape every stuck staging
// AI had on 2026-11-01 (all classes vetoed, WAIT won every tick).
const stuck: DecisionInputs = {
  points: 100,
  manpower: 20,
  canAttack: true,
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
  frontPosture: "BREAK",
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  underThreat: false,
  needsEconomy: false,
  needsFood: false,
  hasEconomicBuild: false,
  hasFortBuild: false,
  hasSiegeBattery: false,
  hasRelayBeaconBuild: false,
  relayBeaconSiteValue: 0,
  beaconBoostActive: false,
  foodSlotsExhausted: false,
  hasFoodSlotReliefCandidate: false,
  hasFoodSlotReenableCandidate: false,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

const broke: WaitContext = { relayBeaconAffordable: false, frontierNonHostileTargetCount: 0 };
const funded: WaitContext = { relayBeaconAffordable: true, frontierNonHostileTargetCount: 0 };
const NON_WAIT = DECISION_CLASSES.filter((cls): cls is Exclude<DecisionClass, "WAIT"> => cls !== "WAIT");

describe("primaryWaitReason", () => {
  it("names an unaffordable beacon when reach is capped", () => {
    expect(primaryWaitReason(stuck, broke)).toBe("WAIT_BEACON_UNAFFORDABLE");
  });

  it("names a missing beacon site once the beacon is affordable", () => {
    expect(primaryWaitReason(stuck, funded)).toBe("WAIT_NO_BEACON_SITE");
  });

  it("says boxed in at peace when the only neighbours are truce partners or allies", () => {
    expect(primaryWaitReason(stuck, { ...funded, frontierNonHostileTargetCount: 12 })).toBe("WAIT_BOXED_IN_AT_PEACE");
  });

  it("names an enemy at the gate when a site exists but a hostile borders the frontier", () => {
    expect(primaryWaitReason({ ...stuck, hasRelayBeaconBuild: true, relayBeaconSiteValue: 30, frontierEnemyCount: 2 }, funded)).toBe("WAIT_BEACON_ENEMY_AT_GATE");
  });

  it("names a worthless site when the best beacon only reaches one plain tile", () => {
    expect(primaryWaitReason({ ...stuck, hasRelayBeaconBuild: true, relayBeaconSiteValue: 1 }, funded)).toBe("WAIT_BEACON_LOW_VALUE");
  });

  it("keeps the dev-slot limit ahead of everything else", () => {
    expect(primaryWaitReason({ ...stuck, devSlotAvailable: false }, broke)).toBe("development_process_limit");
  });

  it("returns nothing specific while EXPAND itself is open", () => {
    expect(primaryWaitReason({ ...stuck, canExpand: true, hasAnyExpandCandidate: true, hasActionableNonWasteExpand: true }, broke)).toBeUndefined();
  });
});

describe("vetoReasonsFor", () => {
  it("gives every vetoed class a reason in the stuck shape", () => {
    const reasons = vetoReasonsFor(stuck, { ...broke, frontierNonHostileTargetCount: 3 }, [...NON_WAIT]);
    expect(reasons).toMatchObject({
      EXPAND: "reach_capped",
      ATTACK: "not_ready",
      MUSTER: "not_ready",
      BUILD_ECONOMY: "no_site_or_unaffordable",
      BUILD_BEACON: "unaffordable",
      FREE_FOOD_SLOT: "food_not_exhausted",
      CHOOSE_TECH: "handled_by_preplan"
    });
  });

  it("says neighbors_at_peace for ATTACK when ready but every neighbour is a truce partner or ally", () => {
    expect(vetoReasonsFor({ ...stuck, attackReady: true }, { ...broke, frontierNonHostileTargetCount: 3 }, ["ATTACK"]).ATTACK).toBe("neighbors_at_peace");
  });

  // Drift guard against decisions.ts: a class whose gates all pass must not
  // report a gate as its veto reason.
  it("never reports a gate for a class that still scores above 0", () => {
    const variants: DecisionInputs[] = [
      { ...stuck, canExpand: true, hasAnyExpandCandidate: true, hasActionableNonWasteExpand: true, expansionOpportunityCount: 3 },
      { ...stuck, hasRelayBeaconBuild: true, relayBeaconSiteValue: 30 },
      { ...stuck, hasEconomicBuild: true, needsEconomy: true },
      { ...stuck, hasAnyAttackCandidate: true, attackReady: true, pressureAttackScore: 400, frontierEnemyCount: 1 },
      { ...stuck, musterReady: true, hasWeakEnemyBorder: true, pressureAttackScore: 400, frontierEnemyCount: 1 },
      { ...stuck, hasFortBuild: true, frontierEnemyCount: 2, pressureAttackScore: 400 }
    ];
    for (const inp of variants) {
      const reasons = vetoReasonsFor(inp, funded, [...NON_WAIT]);
      for (const cls of NON_WAIT) {
        if (scoreDecision(cls, inp) > 0) expect([undefined, "low_score"]).toContain(reasons[cls]);
      }
    }
  });
});
