import { describe, expect, it } from "vitest";
import {
  AI_EMPIRE_ACTIONS,
  AI_EMPIRE_GOALS,
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
      underThreat: true,
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
      underThreat: false,
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
});
