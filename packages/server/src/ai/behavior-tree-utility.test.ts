import { describe, expect, it } from "vitest";

import { evaluateAiBehaviorTree } from "./behavior-tree.js";
import type { AiRewriteContext } from "./rewrite-types.js";
import { chooseAiRewriteIntent, createAiRewriteEvaluation } from "./utility-ai.js";

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

describe("behavior tree + utility AI", () => {
  it("prioritizes survival when the core is under critical threat", () => {
    const result = evaluateAiBehaviorTree({
      ...baseContext(),
      underThreat: true,
      threatCritical: true,
      pressureThreatensCore: true,
      fortProtectsCore: true
    });

    expect(result.doctrine.doctrineId).toBe("CRISIS_STABILIZE");
    expect(result.intent).toBe("SURVIVE");
    expect(result.action).toBe("fortify_chokepoint");
  });

  it("prioritizes economic recovery when income and food are weak", () => {
    const result = evaluateAiBehaviorTree({
      ...baseContext(),
      aiIncome: 8,
      economyWeak: true,
      foodCoverage: 0.6,
      foodCoverageLow: true
    });

    expect(result.doctrine.doctrineId).toBe("ECONOMIC_SCALING");
    expect(result.intent).toBe("RECOVER_ECONOMY");
    expect(result.action).toBe("recover_economy");
  });

  it("uses settlement pressure for settled-territory races", () => {
    const result = evaluateAiBehaviorTree({
      ...baseContext(),
      primaryVictoryPath: "SETTLED_TERRITORY",
      strategicFocus: "ISLAND_FOOTPRINT",
      settledTiles: 12,
      settledTilesTarget: 100,
      islandSettlementAvailable: true,
      undercoveredIslandCount: 2
    });

    expect(result.doctrine.doctrineId).toBe("ISLAND_EXPANSION");
    expect(["SETTLE_FRONTIER", "EXPAND_FRONTIER"]).toContain(result.intent);
    expect(["settle_frontier", "expand_frontier"]).toContain(result.action);
  });

  it("prefers pressure when town-control progress is lagging and attack lanes exist", () => {
    const result = evaluateAiBehaviorTree({
      ...baseContext(),
      primaryVictoryPath: "TOWN_CONTROL",
      controlledTowns: 1,
      townsTarget: 8,
      enemyAttackAvailable: true,
      pressureAttackScore: 420
    });

    expect(result.doctrine.doctrineId).toBe("TOWN_ASSAULT");
    expect(result.intent).toBe("PRESSURE_ENEMY");
    expect(result.action).toBe("pressure_enemy");
  });

  it("keeps the opening focused on growth instead of early attacks", () => {
    const result = evaluateAiBehaviorTree({
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

    expect(result.doctrine.doctrineId).toBe("ECONOMIC_SCALING");
    expect(["EXPAND_FRONTIER", "SETTLE_FRONTIER", "RECOVER_ECONOMY"]).toContain(result.intent);
    expect(result.intent).not.toBe("PRESSURE_ENEMY");
  });

  it("falls back to wait under queue backpressure and pending resolution", () => {
    const result = evaluateAiBehaviorTree({
      ...baseContext(),
      canAffordFrontierAction: false,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      pendingCaptures: 2,
      pendingSettlement: true,
      simulationQueueBackpressure: true,
      workerQueueBackpressure: true,
      economicExpandAvailable: false,
      neutralExpandAvailable: false,
      settlementAvailable: false,
      economicBuildAvailable: false
    });

    expect(result.action).toBe("wait");
  });

  it("publishes the replacement rollout and budget targets", () => {
    const evaluation = createAiRewriteEvaluation();

    expect(evaluation.competencies.some((entry) => entry.key === "attack_enemy_border")).toBe(true);
    expect(evaluation.competencies.some((entry) => entry.key === "pick_tech")).toBe(true);
    expect(evaluation.budget.targetAiCount).toBe(100);
    expect(evaluation.budget.policyBudgetMsPerBatch).toBe(25);
    expect(evaluation.rolloutPhases).toHaveLength(4);
  });

  it("exposes ranked utility options for debugging", () => {
    const decision = chooseAiRewriteIntent({
      ...baseContext(),
      strategicFocus: "SHARD_RUSH",
      shardAvailable: true
    });

    expect(decision.doctrine.doctrineId).toBeDefined();
    expect(decision.utility[0]).toBeDefined();
    expect(decision.utility.length).toBe(10);
  });
});
