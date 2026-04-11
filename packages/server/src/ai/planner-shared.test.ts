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
  attackReady: false,
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  settlementAvailable: false,
  townSupportSettlementAvailable: false,
  islandExpandAvailable: false,
  islandSettlementAvailable: false,
  undercoveredIslandCount: 0,
  weakestIslandRatio: 1,
  fortAvailable: false,
  fortProtectsCore: false,
  fortIsDockChokePoint: false,
  economicBuildAvailable: false,
  siegeOutpostAvailable: false,
  frontierOpportunityEconomic: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  scoutExpandWorthwhile: false,
  canAffordFrontierAction: true,
  canAffordSettlement: true,
  canBuildFort: false,
  canBuildEconomy: false,
  canBuildSiegeOutpost: false,
  goldHealthy: true,
  victoryPathContender: false
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

  it("chooses food build before food expansion when a legal recovery structure exists", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      controlledTowns: 1,
      foodCoverage: 0.9,
      foodCoverageLow: true,
      economicBuildAvailable: true,
      canBuildEconomy: true,
      economicExpandAvailable: true,
      settlementAvailable: false
    });

    expect(decision.actionKey).toBe("build_economic_structure");
    expect(decision.reason).toBe("executed_food_build_priority");
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
      controlledTowns: 1,
      frontPosture: "CONTAIN",
      pressureAttackAvailable: true,
      attackReady: false,
      pressureAttackScore: 480,
      pressureThreatensCore: false,
      islandExpandAvailable: true,
      undercoveredIslandCount: 4,
      weakestIslandRatio: 0
    });

    expect(decision.actionKey).toBe("claim_neutral_border_tile");
    expect(decision.reason).toBe("executed_island_expand_priority");
  });

  it("does not force island expansion when settled-territory AI is not in island-footprint mode", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "BALANCED",
      islandExpandAvailable: true,
      undercoveredIslandCount: 4,
      weakestIslandRatio: 0,
      neutralExpandAvailable: true,
      frontierOpportunityWaste: 8
    });

    expect(decision.reason).not.toBe("executed_island_expand_priority");
  });

  it("prioritizes town-support settlement before generic island pressure when core support can be restored safely", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      townSupportSettlementAvailable: true,
      islandSettlementAvailable: true,
      pressureThreatensCore: false
    });

    expect(decision.actionKey).toBe("settle_owned_frontier_tile");
    expect(decision.reason).toBe("executed_town_support_settlement_priority");
  });

  it("still counterattacks immediately when hostile pressure threatens core tiles", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      frontPosture: "CONTAIN",
      pressureAttackAvailable: true,
      attackReady: true,
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
      attackReady: false,
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

  it("builds economy before expanding when both are legal during recovery", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      economyWeak: true,
      economicExpandAvailable: true,
      economicBuildAvailable: true,
      canBuildEconomy: true
    });

    expect(decision.actionKey).toBe("build_economic_structure");
    expect(decision.reason).toBe("executed_economic_priority");
  });

  it("does not scout as a fallback when scouting is not worthwhile", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      scoutExpandAvailable: true,
      scoutExpandWorthwhile: false,
      frontierOpportunityWaste: 10
    });

    expect(decision.actionKey).not.toBe("claim_scout_border_tile");
  });

  it("does not launch pressure attacks until the empire is attack-ready", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "TOWN_CONTROL",
      pressureAttackAvailable: true,
      pressureAttackScore: 240,
      attackReady: false
    });

    expect(decision.actionKey).not.toBe("attack_enemy_border_tile");
  });

  it("builds siege pressure when a contender has an uncontested hostile breach site", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "TOWN_CONTROL",
      frontPosture: "BREAK",
      siegeOutpostAvailable: true,
      canBuildSiegeOutpost: true,
      victoryPathContender: true,
      pressureAttackScore: 90
    });

    expect(decision.actionKey).toBe("build_siege_outpost");
    expect(decision.reason).toBe("executed_siege_pressure_priority");
  });

  it("does not force island expansion before the empire has a growth foundation", () => {
    const decision = planAiDecision({
      ...baseSnapshot(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      islandExpandAvailable: true,
      frontierOpportunityWaste: 8,
      undercoveredIslandCount: 4,
      weakestIslandRatio: 0,
      aiIncome: 6,
      controlledTowns: 0,
      hasActiveTown: false,
      hasActiveDock: false
    });

    expect(decision.reason).not.toBe("executed_island_expand_priority");
  });
});
