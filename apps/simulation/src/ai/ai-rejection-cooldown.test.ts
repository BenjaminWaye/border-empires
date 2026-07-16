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
    recordRejectionCooldown(state, "p1", "BUILD_FORT", 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ BUILD_DEFENSE: true });
  });

  it("recordRejectionCooldown maps BUILD_ECONOMIC_STRUCTURE to BUILD_ECONOMY", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", "BUILD_ECONOMIC_STRUCTURE", 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ BUILD_ECONOMY: true });
  });

  it("recordRejectionCooldown maps ATTACK to ATTACK", () => {
    // Regression: ATTACK was missing from COMMAND_TO_DECISION_CLASS, so a
    // rejected ATTACK (e.g. ATTACK_COOLDOWN/LOCKED while the previous attack
    // from the same origin was still resolving) never went on cooldown — the
    // utility policy re-picked ATTACK on the very next tick and re-submitted
    // the same doomed command until the lock cleared ~11 ticks later,
    // inflating rejected-command metrics with wasted resubmissions.
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", "ATTACK", 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS - 1);
    expect(cooldowns).toEqual({ ATTACK: true });
  });

  it("cooldown expires after REJECTION_COOLDOWN_MS", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", "BUILD_FORT", 1000);
    const active = activeCooldownsForPlayer(state, "p1", 1000 + REJECTION_COOLDOWN_MS + 1);
    expect(active).toBeUndefined();
  });

  it("non-build command types do not create cooldowns", () => {
    const state = createRejectionCooldownState();
    recordRejectionCooldown(state, "p1", "EXPAND", 1000);
    const cooldowns = activeCooldownsForPlayer(state, "p1", 1000 + 1);
    expect(cooldowns).toBeUndefined();
  });
});
