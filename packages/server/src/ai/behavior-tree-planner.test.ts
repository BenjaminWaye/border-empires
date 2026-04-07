import { describe, expect, it } from "vitest";

import { planAiDecisionByBrain, type AiPlannerContextExtras } from "./behavior-tree-planner.js";
import type { AiPlanningDecision, AiPlanningSnapshot } from "./planner-shared.js";

const snapshot = (): AiPlanningSnapshot => ({
  primaryVictoryPath: "TOWN_CONTROL",
  strategicFocus: "MILITARY_PRESSURE",
  frontPosture: "BREAK",
  aiIncome: 22,
  runnerUpIncome: 18,
  controlledTowns: 1,
  townsTarget: 8,
  settledTiles: 18,
  settledTilesTarget: 100,
  frontierTiles: 20,
  underThreat: false,
  threatCritical: false,
  economyWeak: false,
  frontierDebt: false,
  foodCoverage: 1,
  foodCoverageLow: false,
  hasActiveTown: true,
  hasActiveDock: false,
  points: 120,
  stamina: 60,
  openingScoutAvailable: false,
  economicExpandAvailable: true,
  neutralExpandAvailable: true,
  scoutExpandAvailable: false,
  scaffoldExpandAvailable: false,
  barbarianAttackAvailable: false,
  enemyAttackAvailable: true,
  pressureAttackAvailable: true,
  pressureAttackScore: 420,
  pressureThreatensCore: false,
  settlementAvailable: true,
  townSupportSettlementAvailable: false,
  islandExpandAvailable: false,
  islandSettlementAvailable: false,
  undercoveredIslandCount: 0,
  weakestIslandRatio: 1,
  fortAvailable: true,
  fortProtectsCore: false,
  fortIsDockChokePoint: false,
  economicBuildAvailable: true,
  frontierOpportunityEconomic: 20,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  canAffordFrontierAction: true,
  canAffordSettlement: true,
  canBuildFort: true,
  canBuildEconomy: true,
  goldHealthy: true
});

const extras = (): AiPlannerContextExtras => ({
  aiCount: 100,
  pendingCaptures: 0,
  pendingSettlement: false,
  simulationQueueBackpressure: false,
  workerQueueBackpressure: false
});

describe("behavior tree planner adapter", () => {
  it("maps behavior-tree enemy pressure into the live attack action key", async () => {
    const result = await planAiDecisionByBrain(snapshot(), "behavior_tree_utility", extras(), async () => ({ reason: "unused" }));

    expect(result.brainMode).toBe("behavior_tree_utility");
    expect(result.doctrineId).toBe("TOWN_ASSAULT");
    expect(result.behaviorIntent).toBe("PRESSURE_ENEMY");
    expect(result.decision.actionKey).toBe("attack_enemy_border_tile");
  });

  it("falls back to goap when goap mode is active", async () => {
    const goapDecision: AiPlanningDecision = { reason: "executed_goap_action", actionKey: "claim_neutral_border_tile" };
    const result = await planAiDecisionByBrain(snapshot(), "goap", extras(), async () => goapDecision);

    expect(result.brainMode).toBe("goap");
    expect(result.decision).toEqual(goapDecision);
    expect(result.shadow).toBeUndefined();
  });

  it("keeps goap live and records the behavior-tree shadow decision in shadow mode", async () => {
    const goapDecision: AiPlanningDecision = { reason: "executed_goap_action", actionKey: "claim_neutral_border_tile" };
    const result = await planAiDecisionByBrain(snapshot(), "shadow", extras(), async () => goapDecision);

    expect(result.brainMode).toBe("goap");
    expect(result.decision).toEqual(goapDecision);
    expect(result.shadow?.actionKey).toBe("attack_enemy_border_tile");
    expect(result.shadow?.doctrineId).toBe("TOWN_ASSAULT");
    expect(result.shadow?.behaviorIntent).toBe("PRESSURE_ENEMY");
  });
});
