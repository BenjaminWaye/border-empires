import { describe, expect, it } from "vitest";
import { createAutomationNoopDiagnostic } from "../automation-command-planner-types.js";
import type { AutomationPlannerDecisionContext } from "../automation-command-planner-helpers.js";
import type { AutomationPlannerTile } from "../automation-command-planner-types.js";
import type { AutomationStrategicSnapshot } from "../automation-strategic-snapshot.js";
import { buildDecisionInputs, runUtilityPolicy, type UtilityDispatchState } from "./utility-dispatch.js";

const tile = (x: number, y: number, ownerId: string): AutomationPlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED"
});

const strategic: AutomationStrategicSnapshot = {
  primaryVictoryPath: "TOWN_CONTROL",
  strategicFocus: "BALANCED",
  frontPosture: "WAR",
  underThreat: true,
  threatCritical: false,
  growthFoundationEstablished: true,
  townSupportExpandAvailable: false,
  islandExpandAvailable: false,
  openingScoutAvailable: false,
  scoutExpandWorthwhile: false,
  pressureAttackScore: 1100,
  pressureThreatensCore: false,
  attackReady: true,
  musterReady: true,
  manpowerSufficient: true,
  hasActiveTown: true,
  hasActiveDock: false
};

// Reproduces the production diagnostic seen live on ai-2 (Sigrid Storm,
// 2026-09-14): frontierBarbarianTargetCount > 0 (hasBarbTarget: true) but no
// best-candidate barbarian target was ever selected (frontierAnalysis has no
// `barbarianAttack`), because analyzeOwnedFrontierTargetsFromLookup only
// records `bestBarbarianAttack` when its own `canAttack` affordability flag
// was true at scan time -- but still counts the target either way (see
// frontier-command-planner.ts's `if (!canAttack) continue;`, placed after
// `barbarianTargets.add(targetKey)`). hasBarbTarget is count-based;
// hasAnyAttackCandidate is candidate-based -- they can diverge, which is
// exactly what left the AI stuck at WAIT with a strong barbarian threat and
// no visible reason why (ATTACK vetoed, but every readable gate said "go").
const buildDivergedBarbarianState = (): UtilityDispatchState<AutomationPlannerTile> => {
  const context: AutomationPlannerDecisionContext<AutomationPlannerTile> = {
    playerId: "ai-2",
    clientSeq: 1,
    issuedAt: 1_000,
    sessionPrefix: "ai-runtime",
    diagnostic: createAutomationNoopDiagnostic("ai-2", "ai-runtime", "wait_and_recover"),
    frontierAnalysis: {
      frontierEnemyTargetCount: 1,
      frontierEnemyPlayerTargetCount: 0,
      // Count says a barbarian target exists on the frontier...
      frontierBarbarianTargetCount: 1,
      frontierNeutralTargetCount: 0,
      frontierOpportunityEconomic: 0,
      frontierOpportunityTownSupport: 0,
      frontierOpportunityScout: 0,
      frontierOpportunityScaffold: 0,
      frontierOpportunityWaste: 0,
      narrowAnalyzeCapped: false,
      neighborCandidateTotal: 1,
      missingNeighborTileCount: 0
      // ...but no `barbarianAttack` best-candidate was recorded for it.
    },
    tilesByKey: new Map(),
    needsFood: false,
    needsEconomy: false
  };

  return {
    context,
    strategic,
    canAttack: true,
    canExpand: false,
    devSlotAvailable: true,
    preferredEnemyAttack: undefined,
    economicBuild: undefined,
    fortBuild: undefined,
    siegeOutpostBuild: undefined,
    attackStalemateTargetTileKeys: undefined,
    expansionObjective: undefined,
    points: 1_000,
    manpower: 1_000,
    decisionCooldowns: undefined
  };
};

describe("ATTACK count-vs-candidate divergence diagnostics", () => {
  it("surfaces hasBarbTarget true / hasAnyAttackCandidate false as distinct gate fields", () => {
    const inputs = buildDecisionInputs(buildDivergedBarbarianState());
    expect(inputs.hasBarbTarget).toBe(true);
    expect(inputs.hasAnyAttackCandidate).toBe(false);
  });

  it("vetoes ATTACK (falls through to WAIT) when the count/candidate gates diverge, and the diagnostic explains why", () => {
    const result = runUtilityPolicy(buildDivergedBarbarianState());
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
    expect(result.diagnostic.utilityGates?.hasBarbTarget).toBe(true);
    expect(result.diagnostic.utilityGates?.hasAnyAttackCandidate).toBe(false);
    expect(result.diagnostic.utilityGates?.hasBarbarianAttackSelection).toBe(false);
  });

  it("reports hasBarbarianAttackSelection true once a best-candidate barbarian target exists", () => {
    const state = buildDivergedBarbarianState();
    state.context.frontierAnalysis.barbarianAttack = {
      from: tile(10, 10, "ai-2"),
      target: tile(11, 10, "barbarian-1"),
      score: 100
    };
    const result = runUtilityPolicy(state);
    expect(result.diagnostic.utilityGates?.hasBarbarianAttackSelection).toBe(true);
    expect(result.diagnostic.utilityGates?.hasAnyAttackCandidate).toBe(true);
  });
});

// Reproduces the *next* production symptom seen live on ai-2 once the
// count/candidate divergence above was ruled out: every gate reads green
// (hasAnyAttackCandidate: true, hasBarbarianAttackSelection: true,
// attackReady: true, stalemated: false, frontPosture: WAR) yet ATTACK still
// scores 0 and WAIT wins on 95/100 sampled ticks. Root cause:
// scoreDecision (decisions.ts) short-circuits to 0 for a class on rejection
// cooldown *before* any of the considerations above ever run (see
// ai-rejection-cooldown.ts -- a rejected ATTACK, e.g. ATTACK_TARGET_INVALID
// because the target changed hands between planning and execution, puts the
// whole ATTACK class on a 10s cooldown). None of the existing gate fields
// can show this; attackOnCooldown is the only one that does.
describe("ATTACK rejection-cooldown diagnostics", () => {
  it("scores ATTACK 0 and reports attackOnCooldown true even when every other gate is green", () => {
    const state = buildDivergedBarbarianState();
    state.context.frontierAnalysis.barbarianAttack = {
      from: tile(10, 10, "ai-2"),
      target: tile(11, 10, "barbarian-1"),
      score: 100
    };
    state.decisionCooldowns = { ATTACK: true };

    const result = runUtilityPolicy(state);
    expect(result.diagnostic.utilityGates?.hasAnyAttackCandidate).toBe(true);
    expect(result.diagnostic.utilityGates?.hasBarbarianAttackSelection).toBe(true);
    expect(result.diagnostic.utilityGates?.attackReady).toBe(true);
    expect(result.diagnostic.utilityGates?.attackOnCooldown).toBe(true);
    expect(result.diagnostic.utilityScores?.ATTACK).toBe(0);
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
  });

  it("reports attackOnCooldown false once the cooldown clears, with everything else unchanged", () => {
    const state = buildDivergedBarbarianState();
    state.context.frontierAnalysis.barbarianAttack = {
      from: tile(10, 10, "ai-2"),
      target: tile(11, 10, "barbarian-1"),
      score: 100
    };
    state.decisionCooldowns = { ATTACK: false };

    const result = runUtilityPolicy(state);
    expect(result.diagnostic.utilityGates?.attackOnCooldown).toBe(false);
    expect(result.diagnostic.utilityScores?.ATTACK).toBeGreaterThan(0);
  });
});
