import { describe, expect, it } from "vitest";

import { scoreDecision, type DecisionInputs } from "./decisions.js";

/**
 * Regression cover: once an AI is reach-starved (every real prize —
 * town/resource/dock/wonder — within reach is claimed out, per
 * ai-economic-heuristics.ts's isReachStarved) and a relay beacon site
 * exists, EXPAND must be hard-vetoed, not merely left to compete on score.
 *
 * Before this fix, EXPAND's veto gate passed through `hasOnlyScoutExpand`
 * (any nearby never-seen tile with fog-reveal value >=30, no economic/town/
 * scaffold value) — true of almost any border edge whether or not anything
 * valuable remains — so a reach-starved AI with an affordable beacon site
 * could still keep grabbing plain scout-value land instead of decisively
 * switching to the beacon that actually fixes the reach lock.
 *
 * hasOnlyScoutExpand no longer unlocks EXPAND at all (see the "AI over-
 * claims low-value land" fix — scoreExpand's veto now requires
 * hasActionableNonWasteExpand or an expansion objective), so these fixtures
 * use a genuine non-waste candidate (hasActionableNonWasteExpand) instead of
 * scout-only land to exercise "EXPAND should still fire" scenarios.
 */

const baseInputs: DecisionInputs = {
  points: 100,
  manpower: 500,
  canAttack: false,
  canExpand: true,
  frontierNeutralCount: 1,
  frontierEnemyCount: 0,
  frontierOpportunityEconomic: 0, // exhausted -- nothing valuable left in reach
  expansionOpportunityCount: 1,
  nonWasteExpansionOpportunityCount: 0,
  hasActionableNonWasteExpand: false,
  hasExpansionObjective: false,
  hasOnlyScoutExpand: false,
  hasWeakEnemyBorder: false,
  hasBarbTarget: false,
  hasAnyExpandCandidate: true,
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
  hasRelayBeaconBuild: true, // a beacon site is ready
  reachStarved: true,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

describe("scoreExpand — reach-starved hard override", () => {
  it("vetoes EXPAND outright once reach-starved with a beacon site ready", () => {
    expect(scoreDecision("EXPAND", baseInputs)).toBe(0);
  });

  it("still scores EXPAND normally when NOT reach-starved and a genuine target exists (baseline unaffected)", () => {
    const notStarved: DecisionInputs = {
      ...baseInputs,
      reachStarved: false,
      hasActionableNonWasteExpand: true,
      nonWasteExpansionOpportunityCount: 1
    };
    expect(scoreDecision("EXPAND", notStarved)).toBeGreaterThan(0);
  });

  it("still scores EXPAND normally when reach-starved but no beacon site exists yet, as long as a genuine target exists", () => {
    const noBeaconSite: DecisionInputs = {
      ...baseInputs,
      hasRelayBeaconBuild: false,
      hasActionableNonWasteExpand: true,
      nonWasteExpansionOpportunityCount: 1
    };
    expect(scoreDecision("EXPAND", noBeaconSite)).toBeGreaterThan(0);
  });

  it("plain scout-value land (fog-reveal only, no real prize) no longer unlocks EXPAND at all", () => {
    // The actual bug this whole investigation started from: a tile that
    // only reveals some fog (scoutScore >= 30, trivially cleared by almost
    // any border-edge tile) used to be enough to let EXPAND fire and claim
    // it, which is why AI empires were observed claiming 92-96% of their
    // reach circle instead of the ~5% that's actually valuable.
    const scoutOnly: DecisionInputs = {
      ...baseInputs,
      reachStarved: false,
      hasOnlyScoutExpand: true,
      hasActionableNonWasteExpand: false,
      hasExpansionObjective: false
    };
    expect(scoreDecision("EXPAND", scoutOnly)).toBe(0);
  });

  it("BUILD_BEACON (not BUILD_ECONOMY) scores positively in the exact same reach-starved state EXPAND is vetoed in", () => {
    // Relay beacon is reach infrastructure, its own decision class, not a
    // BUILD_ECONOMY sub-case — see decisions.ts's scoreBuildBeacon.
    expect(scoreDecision("BUILD_BEACON", baseInputs)).toBeGreaterThan(0);
    expect(scoreDecision("BUILD_ECONOMY", baseInputs)).toBe(0);
  });
});
