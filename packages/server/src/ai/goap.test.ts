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

const baseGoapState = (): AiEmpireGoapState => ({
  hasNeutralLandOpportunity: false,
  hasScoutOpportunity: false,
  hasScaffoldOpportunity: false,
  hasBarbarianTarget: false,
  hasWeakEnemyBorder: false,
  hasSiegeOutpostSite: false,
  attackReady: false,
  needsSettlement: false,
  frontierDebtHigh: false,
  foodCoverageLow: false,
  underThreat: false,
  threatCritical: false,
  economyWeak: false,
  needsFortifiedAnchor: false,
  canAffordFrontierAction: false,
  canAffordSettlement: false,
  canBuildFort: false,
  canBuildEconomy: false,
  canBuildSiegeOutpost: false,
  goldHealthy: true,
  staminaHealthy: true
});

describe("planBestGoal", () => {
  it("prefers defensive stabilization when under threat", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasNeutralLandOpportunity: true,
      hasWeakEnemyBorder: true,
      attackReady: true,
      underThreat: true,
      threatCritical: true,
      needsFortifiedAnchor: true,
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      canBuildFort: true,
      canBuildEconomy: true,
      goldHealthy: true
    };

    const plan = planBestGoal(state, AI_EMPIRE_GOALS, AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("fortify_core_chokepoint");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["build_fort_on_exposed_tile"]);
  });

  it("uses recovery when the empire cannot afford frontier actions yet", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasNeutralLandOpportunity: true,
      hasBarbarianTarget: true,
      economyWeak: true,
      canAffordFrontierAction: false,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      goldHealthy: false,
      staminaHealthy: false
    };

    const plan = planBestGoal(state, AI_EMPIRE_GOALS, AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("stabilize_reserves");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["wait_and_recover"]);
  });

  it("does not choose barbarian attacks until the empire is attack-ready", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasBarbarianTarget: true,
      canAffordFrontierAction: true,
      goldHealthy: true
    };

    const plan = planBestGoal(state, AI_EMPIRE_GOALS, AI_EMPIRE_ACTIONS);

    expect(plan?.steps.map((step) => step.action.key) ?? []).not.toContain("attack_barbarian_border_tile");
  });

  it("finds a two-step expansion and settlement sequence", () => {
    type State = {
      canExpand: boolean;
      needsSettlement: boolean;
      settled: boolean;
    };

    const goals: readonly GoapGoal<State>[] = [{ id: "stabilize_border", priority: 5, desired: { settled: true } }];

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
      ...baseGoapState(),
      needsSettlement: true,
      frontierDebtHigh: true,
      canAffordSettlement: true,
      goldHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("SETTLED_TERRITORY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_settled_territory");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["settle_owned_frontier_tile"]);
  });

  it("can still expand cheaply while conserving settlement reserve", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasNeutralLandOpportunity: true,
      economyWeak: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("ECONOMIC_HEGEMONY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("secure_high_value_frontier");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["claim_neutral_border_tile"]);
  });

  it("prefers reducing frontier debt for the settled territory route", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      needsSettlement: true,
      frontierDebtHigh: true,
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      goldHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("SETTLED_TERRITORY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_settled_territory");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["settle_owned_frontier_tile"]);
  });

  it("can choose scaffold claims as a distinct frontier plan", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasScaffoldOpportunity: true,
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      goldHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("SETTLED_TERRITORY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("secure_high_value_frontier");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["claim_scaffold_border_tile"]);
  });

  it("can still choose enemy pressure when threatened but not critically", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasWeakEnemyBorder: true,
      attackReady: true,
      underThreat: true,
      economyWeak: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("TOWN_CONTROL"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_town_control");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["attack_enemy_border_tile"]);
  });

  it("still allows enemy pressure plans under critical threat when fortification is unavailable", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasWeakEnemyBorder: true,
      attackReady: true,
      frontierDebtHigh: true,
      underThreat: true,
      threatCritical: true,
      economyWeak: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(
      state,
      [{ id: "remove_core_threat", priority: 12, desired: { hasWeakEnemyBorder: false } }],
      AI_EMPIRE_ACTIONS
    );

    expect(plan?.goalId).toBe("remove_core_threat");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["attack_enemy_border_tile"]);
  });

  it("prioritizes food recovery as an explicit economic goal", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasNeutralLandOpportunity: true,
      foodCoverageLow: true,
      economyWeak: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("ECONOMIC_HEGEMONY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("secure_food_supply");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["claim_food_border_tile"]);
  });

  it("lets economic-hegemony plans attack weak borders when the empire is otherwise stable", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasWeakEnemyBorder: true,
      attackReady: true,
      canAffordFrontierAction: true,
      canBuildEconomy: true,
      goldHealthy: true,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, goalsForVictoryPath("ECONOMIC_HEGEMONY"), AI_EMPIRE_ACTIONS);

    expect(plan?.goalId).toBe("season_economic_hegemony");
    expect(plan?.steps.map((step) => step.action.key)).toEqual(["attack_enemy_border_tile"]);
  });

  it("does not scout while the empire is under threat", () => {
    const state: AiEmpireGoapState = {
      ...baseGoapState(),
      hasScoutOpportunity: true,
      underThreat: true,
      threatCritical: true,
      economyWeak: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      goldHealthy: false,
      staminaHealthy: true
    };

    const plan = planBestGoal(state, [{ id: "expand_vision_for_value", priority: 8, desired: { hasScoutOpportunity: false } }], AI_EMPIRE_ACTIONS);

    expect(plan).toBeUndefined();
  });
});
