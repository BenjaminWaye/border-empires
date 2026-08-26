import { describe, expect, it } from "vitest";

import {
  activeCooldownsForPlayer,
  createRejectionCooldownState,
  recordRejectionCooldown,
  REJECTION_COOLDOWN_MS
} from "./ai-rejection-cooldown.js";
import { type DecisionInputs, scoreDecision } from "./utility/decisions.js";
import { evaluateUtilityPolicy } from "./utility/utility-policy.js";

// A neutral starting state mirroring utility-policy.test.ts's BASE, scoped
// down to just the fields BUILD_DEFENSE's considerations touch.
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
  hasAnyExpandCandidate: false,
  hasAnyAttackCandidate: false,
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
  hasRelayBeaconBuild: false,
  relayBeaconSiteValue: 0,
  beaconBoostActive: false,
  foodSlotsExhausted: false,
  hasFoodSlotReliefCandidate: false,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false
};

describe("rejection cooldown", () => {
  const BUILD_DEFENSE_READY: DecisionInputs = {
    ...BASE,
    hasFortBuild: true,
    frontierEnemyCount: 1,
    devSlotAvailable: true,
    pressureAttackScore: 200
  };

  it("BUILD_DEFENSE scores > 0 without cooldown", () => {
    const s = scoreDecision("BUILD_DEFENSE", BUILD_DEFENSE_READY);
    expect(s).toBeGreaterThan(0);
  });

  it("BUILD_DEFENSE scores 0 when on cooldown", () => {
    const s = scoreDecision("BUILD_DEFENSE", {
      ...BUILD_DEFENSE_READY,
      cooldown: { BUILD_DEFENSE: true }
    });
    expect(s).toBe(0);
  });

  it("cooldown forces WAIT to win over BUILD_DEFENSE", () => {
    const withoutCooldown = evaluateUtilityPolicy(BUILD_DEFENSE_READY);
    const withCooldown = evaluateUtilityPolicy({
      ...BUILD_DEFENSE_READY,
      cooldown: { BUILD_DEFENSE: true }
    });
    expect(withoutCooldown.winner).toBe("BUILD_DEFENSE");
    expect(withCooldown.winner).toBe("WAIT");
  });

  it("recordRejectionCooldown maps BUILD_FORT to BUILD_DEFENSE", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", { type: "BUILD_FORT", payloadJson: "{}" }, 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ BUILD_DEFENSE: true });
  });

  it("recordRejectionCooldown maps a plain BUILD_ECONOMIC_STRUCTURE to BUILD_ECONOMY", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(
      state,
      "p1",
      { type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 1, y: 1, structureType: "FARMSTEAD" }) },
      1000
    );
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ BUILD_ECONOMY: true });
  });

  it("recordRejectionCooldown maps a RELAY_BEACON BUILD_ECONOMIC_STRUCTURE to BUILD_BEACON, not BUILD_ECONOMY", () => {
    // Regression: BUILD_ECONOMIC_STRUCTURE is the command TYPE for both a
    // plain economic structure (BUILD_ECONOMY) and a relay beacon
    // (BUILD_BEACON, its own decision class — reach infrastructure, not
    // economy, see decisions.ts's scoreBuildBeacon). The type alone can't
    // distinguish them; only the payload's structureType can. Without this,
    // a rejected beacon build cooled down the WRONG class and BUILD_BEACON
    // was free to re-propose the exact same doomed build every tick.
    const state = createRejectionCooldownState();
    recordRejectionCooldown(
      state,
      "p1",
      { type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 1, y: 1, structureType: "RELAY_BEACON" }) },
      1000
    );
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ BUILD_BEACON: true });
  });

  it("recordRejectionCooldown maps ATTACK to ATTACK", () => {
    // Regression: ATTACK was missing from COMMAND_TO_DECISION_CLASS, so a
    // rejected ATTACK (e.g. ATTACK_COOLDOWN/LOCKED while the previous attack
    // from the same origin was still resolving) never went on cooldown — the
    // utility policy re-picked ATTACK on the very next tick and re-submitted
    // the same doomed command until the lock cleared ~11 ticks later,
    // inflating rejected-command metrics with wasted resubmissions.
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", { type: "ATTACK", payloadJson: "{}" }, 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ ATTACK: true });
  });

  it("recordRejectionCooldown maps UPGRADE_TOWN_TIER to itself (preplan livelock fix)", () => {
    // Regression: UPGRADE_TOWN_TIER is decided by the preplan step
    // (ai-preplan-command.ts), not the utility policy, but a rejection (e.g.
    // INSUFFICIENT_SLOT — no free FOOD slot) still needs to back the AI off,
    // or chooseAiTownTierUpgrade re-picks the exact same tile every tick
    // forever, starving tech/domain choices and the entire main planner for
    // that player.
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", { type: "UPGRADE_TOWN_TIER", payloadJson: "{}" }, 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ UPGRADE_TOWN_TIER: true });
  });

  it("cooldown expires after REJECTION_COOLDOWN_MS", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", { type: "BUILD_FORT", payloadJson: "{}" }, 1000);
    const active = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS + 1);
    expect(active).toBeUndefined();
  });

  it("non-build command types do not create cooldowns", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", { type: "EXPAND", payloadJson: "{}" }, 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + 1);
    expect(cooldowns).toBeUndefined();
  });
});
