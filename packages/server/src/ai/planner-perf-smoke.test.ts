import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { planAiDecision, type AiPlanningSnapshot } from "./planner-shared.js";

const lateGameSnapshot = (): AiPlanningSnapshot => ({
  primaryVictoryPath: "ECONOMIC_HEGEMONY",
  strategicFocus: "MILITARY_PRESSURE",
  frontPosture: "BREAK",
  aiIncome: 58,
  runnerUpIncome: 55,
  controlledTowns: 7,
  townsTarget: 10,
  settledTiles: 110,
  settledTilesTarget: 140,
  frontierTiles: 280,
  underThreat: true,
  threatCritical: true,
  economyWeak: true,
  frontierDebt: true,
  foodCoverage: 1,
  foodCoverageLow: true,
  hasActiveTown: true,
  hasActiveDock: true,
  points: 650,
  stamina: 100,
  openingScoutAvailable: false,
  economicExpandAvailable: true,
  neutralExpandAvailable: true,
  scoutExpandAvailable: true,
  scaffoldExpandAvailable: true,
  barbarianAttackAvailable: true,
  enemyAttackAvailable: true,
  pressureAttackAvailable: true,
  pressureAttackScore: 2350,
  pressureThreatensCore: true,
  settlementAvailable: true,
  townSupportSettlementAvailable: false,
  islandExpandAvailable: false,
  islandSettlementAvailable: false,
  undercoveredIslandCount: 0,
  weakestIslandRatio: 1,
  fortAvailable: true,
  fortProtectsCore: true,
  fortIsDockChokePoint: false,
  economicBuildAvailable: true,
  frontierOpportunityEconomic: 180,
  frontierOpportunityScout: 65,
  frontierOpportunityScaffold: 14,
  frontierOpportunityWaste: 900,
  canAffordFrontierAction: true,
  canAffordSettlement: true,
  canBuildFort: true,
  canBuildEconomy: true,
  goldHealthy: true
});

describe("planAiDecision perf smoke", () => {
  it("stays cheap across many late-game planner evaluations", () => {
    const samples = Array.from({ length: 5000 }, () => lateGameSnapshot());
    const startedAt = performance.now();
    for (const snapshot of samples) {
      planAiDecision(snapshot);
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(250);
  });
});
