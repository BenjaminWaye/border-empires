import { describe, expect, it } from "vitest";
import { planAiDecision, type AiPlanningSnapshot } from "./planner-shared.js";

const baseSnapshot = (): AiPlanningSnapshot => ({
  primaryVictoryPath: "ECONOMIC_HEGEMONY",
  aiIncome: 1,
  runnerUpIncome: 1,
  controlledTowns: 0,
  townsTarget: 1,
  settledTiles: 1,
  settledTilesTarget: 10,
  frontierTiles: 0,
  underThreat: false,
  threatCritical: false,
  economyWeak: true,
  frontierDebt: false,
  foodCoverage: 1,
  foodCoverageLow: false,
  hasActiveTown: false,
  hasActiveDock: false,
  points: 300,
  stamina: 100,
  openingScoutAvailable: false,
  neutralExpandAvailable: false,
  scoutExpandAvailable: false,
  scaffoldExpandAvailable: false,
  barbarianAttackAvailable: false,
  enemyAttackAvailable: false,
  pressureAttackAvailable: false,
  pressureAttackScore: 0,
  settlementAvailable: false,
  fortAvailable: false,
  fortProtectsCore: false,
  fortIsDockChokePoint: false,
  economicBuildAvailable: false,
  frontierOpportunityEconomic: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  canAffordFrontierAction: true,
  canAffordSettlement: true,
  canBuildFort: false,
  canBuildEconomy: false,
  goldHealthy: true
});

describe("planAiDecision", () => {
  it("does not choose economic expand when no exact economic candidate exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      neutralExpandAvailable: false,
      frontierOpportunityEconomic: 3,
      frontierOpportunityWaste: 8
    });

    expect(decision.actionKey).not.toBe("claim_neutral_border_tile");
  });

  it("chooses food expand when an exact economic food candidate exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      controlledTowns: 1,
      foodCoverage: 0,
      foodCoverageLow: true,
      hasActiveTown: true,
      neutralExpandAvailable: true,
      frontierOpportunityEconomic: 2
    });

    expect(decision.actionKey).toBe("claim_food_border_tile");
    expect(decision.reason).toBe("executed_food_expand_priority");
  });
});
