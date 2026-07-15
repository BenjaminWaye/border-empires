import { describe, expect, it } from "vitest";
import { createAutomationNoopDiagnostic } from "../automation-command-planner-types.js";
import type { AutomationPlannerDecisionContext } from "../automation-command-planner-helpers.js";
import type { AutomationPlannerTile } from "../automation-command-planner-types.js";
import type { AutomationStrategicSnapshot } from "../automation-strategic-snapshot.js";
import { runUtilityPolicy, type UtilityDispatchState } from "./utility-dispatch.js";

const tile = (x: number, y: number, ownerId: string): AutomationPlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED"
});

const baseStrategic = (musterTileKeys?: ReadonlySet<string>): AutomationStrategicSnapshot => ({
  primaryVictoryPath: "TOWN_CONTROL",
  strategicFocus: "BALANCED",
  frontPosture: "BREAK",
  underThreat: false,
  threatCritical: false,
  growthFoundationEstablished: true,
  townSupportSettlementAvailable: false,
  townSupportExpandAvailable: false,
  islandExpandAvailable: false,
  islandSettlementAvailable: false,
  openingScoutAvailable: false,
  scoutExpandWorthwhile: false,
  pressureAttackScore: 200,
  pressureThreatensCore: false,
  attackReady: true,
  musterReady: true,
  manpowerSufficient: true,
  victoryPathContender: false,
  hasActiveTown: true,
  hasActiveDock: false,
  ...(musterTileKeys ? { musterTileKeys } : {})
});

const buildState = (musterTileKeys?: ReadonlySet<string>): UtilityDispatchState<AutomationPlannerTile> => {
  const context: AutomationPlannerDecisionContext<AutomationPlannerTile> = {
    playerId: "ai-1",
    clientSeq: 1,
    issuedAt: 1_000,
    sessionPrefix: "ai-runtime",
    diagnostic: createAutomationNoopDiagnostic("ai-1", "ai-runtime", "wait_and_recover"),
    settlementCandidate: undefined,
    fallbackSettlementCandidate: undefined,
    frontierAnalysis: {
      frontierEnemyTargetCount: 1,
      frontierEnemyPlayerTargetCount: 1,
      frontierBarbarianTargetCount: 0,
      frontierNeutralTargetCount: 0,
      frontierOpportunityEconomic: 0,
      frontierOpportunityTownSupport: 0,
      frontierOpportunityScout: 0,
      frontierOpportunityScaffold: 0,
      frontierOpportunityWaste: 0,
      narrowAnalyzeCapped: false,
      neighborCandidateTotal: 0,
      missingNeighborTileCount: 0,
      enemyAttack: {
        from: tile(10, 10, "ai-1"),
        target: tile(11, 10, "player-2"),
        score: 100
      }
    },
    tilesByKey: new Map(),
    needsFood: false,
    needsEconomy: false
  };

  return {
    context,
    strategic: baseStrategic(musterTileKeys),
    canAttack: true,
    canExpand: false,
    devSlotAvailable: false,
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

// Regression: the utility scorer re-picks MUSTER every tick a weak enemy
// border stays hot, and previously issued a fresh SET_MUSTER at the same
// tile every time regardless of whether a flag was already there — 5000+
// permanently-QUEUED SET_MUSTER commands found in production (a separate
// bug, fixed by making the command properly resolve — see
// runtime-structure-lifecycle-command-handlers.ts). This test pins the
// AI-side fix: don't even ask for a flag that already exists.
describe("runUtilityPolicy MUSTER reissue guard", () => {
  it("issues SET_MUSTER when the target tile has no active flag yet", () => {
    const result = runUtilityPolicy(buildState(undefined));
    expect(result.command).toMatchObject({ type: "SET_MUSTER", payloadJson: JSON.stringify({ x: 10, y: 10, mode: "ADVANCE" }) });
  });

  it("does not reissue SET_MUSTER when the target tile already has this player's active flag", () => {
    const result = runUtilityPolicy(buildState(new Set(["10,10"])));
    expect(result.command).toBeUndefined();
  });
});
