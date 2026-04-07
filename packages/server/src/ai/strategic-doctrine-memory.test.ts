import { describe, expect, it } from "vitest";

import type { AiRewriteContext } from "./rewrite-types.js";
import { AI_DOCTRINE_REEVALUATE_MS, resolveAiDoctrine } from "./strategic-doctrine-memory.js";

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

describe("strategic doctrine memory", () => {
  it("reuses doctrine when the invalidation signature is unchanged", () => {
    const first = resolveAiDoctrine(baseContext(), 1_000);
    const second = resolveAiDoctrine(baseContext(), 2_000, first.memory);

    expect(second.reusedExisting).toBe(true);
    expect(second.decision.doctrineId).toBe(first.decision.doctrineId);
    expect(second.memory).toBe(first.memory);
  });

  it("reevaluates after the time budget expires", () => {
    const first = resolveAiDoctrine(baseContext(), 1_000);
    const second = resolveAiDoctrine(baseContext(), 1_000 + AI_DOCTRINE_REEVALUATE_MS + 1, first.memory);

    expect(second.memory.updatedAt).toBe(1_000 + AI_DOCTRINE_REEVALUATE_MS + 1);
  });

  it("switches doctrine when the world meaningfully changes", () => {
    const first = resolveAiDoctrine(baseContext(), 1_000);
    const second = resolveAiDoctrine(
      {
        ...baseContext(),
        underThreat: true,
        threatCritical: true,
        pressureThreatensCore: true,
        economyWeak: true
      },
      2_000,
      first.memory
    );

    expect(second.reusedExisting).toBe(false);
    expect(second.decision.doctrineId).toBe("CRISIS_STABILIZE");
  });
});
