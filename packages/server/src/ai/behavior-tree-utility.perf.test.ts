import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { evaluateAiBehaviorTree } from "./behavior-tree.js";
import type { AiRewriteContext } from "./rewrite-types.js";

const sampleContext = (index: number): AiRewriteContext => ({
  primaryVictoryPath: index % 3 === 0 ? "TOWN_CONTROL" : index % 3 === 1 ? "SETTLED_TERRITORY" : "ECONOMIC_HEGEMONY",
  strategicFocus:
    index % 5 === 0
      ? "MILITARY_PRESSURE"
      : index % 5 === 1
        ? "ISLAND_FOOTPRINT"
        : index % 5 === 2
          ? "ECONOMIC_RECOVERY"
          : index % 5 === 3
            ? "BORDER_CONTAINMENT"
            : "BALANCED",
  frontPosture: index % 4 === 0 ? "BREAK" : index % 4 === 1 ? "CONTAIN" : "TRUCE",
  aiCount: 100,
  points: 40 + (index % 12) * 20,
  stamina: -10 + (index % 9) * 12,
  aiIncome: 6 + (index % 15) * 3,
  runnerUpIncome: 10 + (index % 11) * 3,
  controlledTowns: index % 8,
  townsTarget: 10,
  settledTiles: 8 + (index % 40) * 2,
  settledTilesTarget: 120,
  frontierTiles: 4 + (index % 30),
  underThreat: index % 2 === 0,
  threatCritical: index % 7 === 0,
  economyWeak: index % 3 === 0,
  frontierDebt: index % 4 === 0,
  foodCoverage: 0.5 + (index % 8) * 0.15,
  foodCoverageLow: index % 3 === 1,
  pressureAttackScore: (index % 25) * 50,
  pressureThreatensCore: index % 6 === 0,
  undercoveredIslandCount: index % 4,
  weakestIslandRatio: 0.3 + (index % 5) * 0.15,
  canAffordFrontierAction: index % 7 !== 0,
  canAffordSettlement: index % 6 !== 0,
  canBuildFort: index % 5 !== 0,
  canBuildEconomy: index % 4 !== 0,
  openingScoutAvailable: index % 9 === 0,
  economicExpandAvailable: index % 2 === 0,
  neutralExpandAvailable: index % 3 !== 0,
  scoutExpandAvailable: index % 4 === 0,
  scaffoldExpandAvailable: index % 5 === 0,
  barbarianAttackAvailable: index % 3 === 0,
  enemyAttackAvailable: index % 2 === 0,
  settlementAvailable: index % 3 !== 1,
  townSupportSettlementAvailable: index % 4 === 0,
  islandSettlementAvailable: index % 5 === 1,
  islandExpandAvailable: index % 5 === 2,
  fortAvailable: true,
  fortProtectsCore: index % 3 === 0,
  fortIsDockChokePoint: index % 6 === 0,
  economicBuildAvailable: index % 2 === 0,
  shardAvailable: index % 10 === 0,
  truceRequestAvailable: index % 8 === 0,
  truceAcceptanceAvailable: index % 9 === 0,
  pendingCaptures: index % 3,
  pendingSettlement: index % 7 === 0,
  simulationQueueBackpressure: index % 17 === 0,
  workerQueueBackpressure: index % 19 === 0
});

describe("behavior tree + utility perf smoke", () => {
  it("evaluates a 100-ai planning batch cheaply", () => {
    const agents = Array.from({ length: 100 }, (_, index) => sampleContext(index));
    const startedAt = performance.now();
    for (let batch = 0; batch < 1000; batch += 1) {
      for (const agent of agents) {
        evaluateAiBehaviorTree(agent);
      }
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(500);
  });
});
