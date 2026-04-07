import { describe, expect, it } from "vitest";

import type { AiRewriteContext } from "./rewrite-types.js";
import { chooseAiStrategicDoctrine } from "./strategic-doctrine.js";

const baseContext = (): AiRewriteContext => ({
  primaryVictoryPath: "ECONOMIC_HEGEMONY",
  strategicFocus: "BALANCED",
  frontPosture: "BREAK",
  aiCount: 100,
  points: 120,
  stamina: 40,
  aiIncome: 16,
  runnerUpIncome: 20,
  controlledTowns: 2,
  townsTarget: 8,
  settledTiles: 20,
  settledTilesTarget: 80,
  frontierTiles: 16,
  underThreat: false,
  threatCritical: false,
  economyWeak: false,
  frontierDebt: false,
  foodCoverage: 1.1,
  foodCoverageLow: false,
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  undercoveredIslandCount: 0,
  weakestIslandRatio: 1,
  canAffordFrontierAction: true,
  canAffordSettlement: true,
  canBuildFort: true,
  canBuildEconomy: true,
  openingScoutAvailable: false,
  economicExpandAvailable: true,
  neutralExpandAvailable: true,
  scoutExpandAvailable: false,
  scaffoldExpandAvailable: false,
  barbarianAttackAvailable: false,
  enemyAttackAvailable: false,
  settlementAvailable: true,
  townSupportSettlementAvailable: false,
  islandSettlementAvailable: false,
  islandExpandAvailable: false,
  fortAvailable: true,
  fortProtectsCore: false,
  fortIsDockChokePoint: false,
  economicBuildAvailable: true,
  shardAvailable: false,
  truceRequestAvailable: false,
  truceAcceptanceAvailable: false,
  pendingCaptures: 0,
  pendingSettlement: false,
  simulationQueueBackpressure: false,
  workerQueueBackpressure: false
});

describe("strategic doctrine", () => {
  it("chooses crisis stabilization under heavy pressure", () => {
    const doctrine = chooseAiStrategicDoctrine({
      ...baseContext(),
      underThreat: true,
      threatCritical: true,
      pressureThreatensCore: true,
      economyWeak: true
    });

    expect(doctrine.doctrineId).toBe("CRISIS_STABILIZE");
  });

  it("chooses island expansion when the island footprint race is open", () => {
    const doctrine = chooseAiStrategicDoctrine({
      ...baseContext(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      undercoveredIslandCount: 3,
      islandExpandAvailable: true,
      islandSettlementAvailable: true,
      settledTiles: 12,
      settledTilesTarget: 100
    });

    expect(doctrine.doctrineId).toBe("ISLAND_EXPANSION");
  });

  it("chooses town assault when town control is lagging but pressure lanes exist", () => {
    const doctrine = chooseAiStrategicDoctrine({
      ...baseContext(),
      primaryVictoryPath: "TOWN_CONTROL",
      controlledTowns: 1,
      townsTarget: 10,
      enemyAttackAvailable: true,
      pressureAttackScore: 420
    });

    expect(doctrine.doctrineId).toBe("TOWN_ASSAULT");
  });

  it("stays on economic scaling in the opening even if attack lanes exist", () => {
    const doctrine = chooseAiStrategicDoctrine({
      ...baseContext(),
      primaryVictoryPath: "TOWN_CONTROL",
      controlledTowns: 0,
      settledTiles: 3,
      aiIncome: 6,
      enemyAttackAvailable: true,
      pressureAttackScore: 420,
      settlementAvailable: true,
      economicExpandAvailable: true
    });

    expect(doctrine.doctrineId).toBe("ECONOMIC_SCALING");
  });
});
