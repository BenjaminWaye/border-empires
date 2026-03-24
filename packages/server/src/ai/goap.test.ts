import { describe, expect, it } from "vitest";
import {
  AI_EMPIRE_ACTIONS,
  AI_EMPIRE_GOALS,
  goalsForVictoryPath,
  planBestGoal,
  rankSeasonVictoryPaths,
  type AiEmpireGoapState,
  type GoapAction,
  type GoapGoal
} from "./goap.js";

describe("planBestGoal", () => {
  it("prefers defensive stabilization when under threat", () => {
    const state: AiEmpireGoapState = {
      hasNeutralLandOpportunity: true,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: true,
      needsSettlement: false,
      frontierDebtHigh: false,
      underThreat: true,
      threatCritical: true,
      economyWeak: false,
      needsFortifiedAnchor: true,
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      canBuildFort: true,
      canBuildEconomy: true,
      goldHealthy: true,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, AI_EMPIRE_GOALS, AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("fortify_capital");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["build_fort_on_exposed_tile"]);
  });

  it("uses recovery when the empire cannot afford frontier actions yet", () => {
    const state: AiEmpireGoapState = {
      hasNeutralLandOpportunity: true,
      hasBarbarianTarget: true,
      hasWeakEnemyBorder: false,
      needsSettlement: false,
      frontierDebtHigh: false,
      underThreat: false,
      threatCritical: false,
      economyWeak: true,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: false,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      goldHealthy: false,
      staminaHealthy: false
    };

    const plan = planBestGoal(state, AI_EMPIRE_GOALS, AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("recover_resources");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["wait_and_recover"]);
  });

  it("finds a two-step expansion and settlement sequence", () => {
    type State = {
      canExpand: boolean;
      needsSettlement: boolean;
      settled: boolean;
    };

    const goals: readonly GoapGoal<State>[] = [
      { id: "stabilize_border", priority: 5, desired: { settled: true } }
    ];

    const actions: readonly GoapAction<State>[] = [
      {
        key: "expand",
        cost: 2,
        preconditions: { canExpand: true, needsSettlement: false },
        effects: { canExpand: false, needsSettlement: true }
      },
      {
        key: "settle",
        cost: 2,
        preconditions: { needsSettlement: true },
        effects: { needsSettlement: false, settled: true }
      }
    ];

    const plan = planBestGoal(
      { canExpand: true, needsSettlement: false, settled: false },
      goals,
      actions,
      { maxDepth: 3 }
    );

    expect(plan?.goalId).toBe("stabilize_border");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["expand", "settle"]);
    expect(plan?.totalCost).toBe(4);
  });

  it("ranks season victory paths so the AI can bias toward the best route", () => {
    const ranked = rankSeasonVictoryPaths({
      townsControlled: 9,
      townsTarget: 10,
      incomePerMinute: 28,
      incomeLeaderGap: -6,
      settledTiles: 40,
      settledTilesTarget: 80,
      underThreat: false,
      goldHealthy: true,
      staminaHealthy: true
    });

    expect(ranked[0]?.id).toBe("TOWN_CONTROL");
    expect(ranked[0]?.rationale).toContain("9/10");
  });

  it("promotes season victory routes to explicit GOAP goals", () => {
    const state: AiEmpireGoapState = {
      hasNeutralLandOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      needsSettlement: true,
      frontierDebtHigh: true,
      underThreat: false,
      threatCritical: false,
      economyWeak: false,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: false,
      canAffordSettlement: true,
      canBuildFort: false,
      canBuildEconomy: false,
      goldHealthy: true,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("SETTLED_TERRITORY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_settled_territory");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["settle_owned_frontier_tile"]);
  });

  it("can still expand cheaply while conserving settlement reserve", () => {
    const state: AiEmpireGoapState = {
      hasNeutralLandOpportunity: true,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      needsSettlement: false,
      frontierDebtHigh: false,
      underThreat: false,
      threatCritical: false,
      economyWeak: true,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("ECONOMIC_HEGEMONY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("expand_frontier");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["claim_neutral_border_tile"]);
  });

  it("prefers reducing frontier debt for the settled territory route", () => {
    const state: AiEmpireGoapState = {
      hasNeutralLandOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      needsSettlement: true,
      frontierDebtHigh: true,
      underThreat: false,
      threatCritical: false,
      economyWeak: false,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      canBuildFort: false,
      canBuildEconomy: false,
      goldHealthy: true,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("SETTLED_TERRITORY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_settled_territory");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["settle_owned_frontier_tile"]);
  });
});
