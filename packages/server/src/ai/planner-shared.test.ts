import { describe, expect, it } from "vitest";
import { planAiDecision, type AiPlanningSnapshot } from "./planner-shared.js";

const baseSnapshot = (): AiPlanningSnapshot => ({
  primaryVictoryPath: "ECONOMIC_HEGEMONY",
  strategicFocus: "BALANCED",
  frontPosture: "BREAK",
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
  economicExpandAvailable: false,
  neutralExpandAvailable: false,
  scoutExpandAvailable: false,
  scaffoldExpandAvailable: false,
  barbarianAttackAvailable: false,
  enemyAttackAvailable: false,
  pressureAttackAvailable: false,
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  settlementAvailable: false,
  islandExpandAvailable: false,
  islandSettlementAvailable: false,
  undercoveredIslandCount: 0,
  weakestIslandRatio: 1,
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
  it("uses generic neutral expansion fallback when no exact economic candidate exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      neutralExpandAvailable: true,
      economicExpandAvailable: false,
      frontierOpportunityEconomic: 3,
      frontierOpportunityWaste: 8
    });

    expect(decision.actionKey).toBe("claim_neutral_border_tile");
  });

  it("chooses food expand when an exact economic food candidate exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      controlledTowns: 1,
      foodCoverage: 0,
      foodCoverageLow: true,
      economicExpandAvailable: true,
      hasActiveTown: true,
      neutralExpandAvailable: true,
      frontierOpportunityEconomic: 2
    });

    expect(decision.actionKey).toBe("claim_food_border_tile");
    expect(decision.reason).toBe("executed_food_expand_priority");
  });

  it("does not choose fort priority when fort building is unavailable", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      underThreat: true,
      threatCritical: true,
      controlledTowns: 2,
      fortAvailable: true,
      fortProtectsCore: true,
      canBuildFort: false
    });

    expect(decision.actionKey).not.toBe("build_fort_on_exposed_tile");
  });

  it("falls back to neutral expansion instead of no_goap_step when only generic neutral land exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      neutralExpandAvailable: true,
      frontierOpportunityWaste: 5,
      canAffordFrontierAction: true
    });

    expect(decision.actionKey).toBe("claim_neutral_border_tile");
    expect(decision.reason).not.toBe("no_goap_step");
  });

  it("does not choose food-goap expansion when only waste neutral land exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      controlledTowns: 1,
      foodCoverage: 0,
      foodCoverageLow: true,
      neutralExpandAvailable: true,
      frontierOpportunityEconomic: 0,
      frontierOpportunityWaste: 9
    });

    expect(decision.actionKey).not.toBe("claim_food_border_tile");
  });

  it("prefers island expansion for settled-territory plans when the threatened front is non-core", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      frontPosture: "CONTAIN",
      pressureAttackAvailable: true,
      pressureAttackScore: 480,
      pressureThreatensCore: false,
      islandExpandAvailable: true,
      undercoveredIslandCount: 4,
      weakestIslandRatio: 0
    });

    expect(decision.actionKey).toBe("claim_neutral_border_tile");
    expect(decision.reason).toBe("executed_island_expand_priority");
  });

  it("still counterattacks immediately when hostile pressure threatens core tiles", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      frontPosture: "CONTAIN",
      pressureAttackAvailable: true,
      pressureAttackScore: 480,
      pressureThreatensCore: true,
      islandExpandAvailable: true,
      undercoveredIslandCount: 4,
      weakestIslandRatio: 0
    });

    expect(decision.actionKey).toBe("attack_enemy_border_tile");
    expect(decision.reason).toBe("executed_pressure_counterattack_priority");
  });

  it("uses containment forts instead of pointless attacks on non-core stalled borders", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      strategicFocus: "BORDER_CONTAINMENT",
      frontPosture: "CONTAIN",
      pressureAttackAvailable: true,
      pressureAttackScore: 210,
      pressureThreatensCore: false,
      fortAvailable: true,
      fortProtectsCore: true,
      canBuildFort: true,
      points: 80
    });

    expect(decision.actionKey).toBe("build_fort_on_exposed_tile");
    expect(decision.reason).toBe("executed_containment_fort_priority");
  });
});
