export interface GoapAction<State> {
  key: string;
  cost: number;
  preconditions: Partial<State>;
  effects: Partial<State>;
  meta?: {
    goalIds?: string[];
    description?: string;
  };
}

export interface GoapGoal<State> {
  id: string;
  priority: number;
  desired: Partial<State>;
}

export interface GoapPlanStep<State> {
  action: GoapAction<State>;
  state: State;
}

export interface GoapPlan<State> {
  goalId: string;
  totalCost: number;
  steps: GoapPlanStep<State>[];
}

export interface GoapPlannerOptions {
  maxDepth?: number;
  maxVisited?: number;
}

const DEFAULT_OPTIONS: Required<GoapPlannerOptions> = {
  maxDepth: 4,
  maxVisited: 512
};

const matchesPartial = <State extends object>(state: State, partial: Partial<State>): boolean => {
  for (const [key, value] of Object.entries(partial)) {
    if (state[key as keyof State] !== value) return false;
  }
  return true;
};

const applyEffects = <State extends object>(state: State, effects: Partial<State>): State => ({
  ...state,
  ...effects
});

const stableStateKey = <State extends object>(state: State): string => {
  const entries = Object.entries(state).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

const usableActions = <State extends object>(state: State, actions: readonly GoapAction<State>[], goalId: string): GoapAction<State>[] =>
  actions.filter((action) => {
    if (!matchesPartial(state, action.preconditions)) return false;
    const goalIds = action.meta?.goalIds;
    return !goalIds || goalIds.length === 0 || goalIds.includes(goalId);
  });

const findPlanForGoal = <State extends object>(
  initialState: State,
  goal: GoapGoal<State>,
  actions: readonly GoapAction<State>[],
  options?: GoapPlannerOptions
): GoapPlan<State> | undefined => {
  const { maxDepth, maxVisited } = { ...DEFAULT_OPTIONS, ...options };

  if (matchesPartial(initialState, goal.desired)) {
    return { goalId: goal.id, totalCost: 0, steps: [] };
  }

  type Node = {
    state: State;
    totalCost: number;
    steps: GoapPlanStep<State>[];
  };

  const queue: Node[] = [{ state: initialState, totalCost: 0, steps: [] }];
  const seen = new Map<string, number>([[stableStateKey(initialState), 0]]);
  let visited = 0;

  while (queue.length > 0 && visited < maxVisited) {
    queue.sort((a, b) => a.totalCost - b.totalCost || a.steps.length - b.steps.length);
    const current = queue.shift();
    if (!current) break;
    visited += 1;

    if (matchesPartial(current.state, goal.desired)) {
      return {
        goalId: goal.id,
        totalCost: current.totalCost,
        steps: current.steps
      };
    }

    if (current.steps.length >= maxDepth) continue;

    for (const action of usableActions(current.state, actions, goal.id)) {
      const nextState = applyEffects(current.state, action.effects);
      const nextCost = current.totalCost + action.cost;
      const nextKey = stableStateKey(nextState);
      const prevBest = seen.get(nextKey);
      if (prevBest !== undefined && prevBest <= nextCost) continue;
      seen.set(nextKey, nextCost);
      queue.push({
        state: nextState,
        totalCost: nextCost,
        steps: [...current.steps, { action, state: nextState }]
      });
    }
  }

  return undefined;
};

export const planBestGoal = <State extends object>(
  initialState: State,
  goals: readonly GoapGoal<State>[],
  actions: readonly GoapAction<State>[],
  options?: GoapPlannerOptions
): GoapPlan<State> | undefined => {
  const unsatisfiedGoals = goals.filter((goal) => !matchesPartial(initialState, goal.desired));
  const rankedGoals = [...(unsatisfiedGoals.length > 0 ? unsatisfiedGoals : goals)].sort((a, b) => b.priority - a.priority);
  let best: GoapPlan<State> | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const goal of rankedGoals) {
    const plan = findPlanForGoal(initialState, goal, actions, options);
    if (!plan) continue;
    const score = goal.priority - plan.totalCost;
    if (!best || score > bestScore) {
      best = plan;
      bestScore = score;
    }
  }

  return best;
};

export interface AiEmpireGoapState {
  hasNeutralLandOpportunity: boolean;
  hasScoutOpportunity: boolean;
  hasScaffoldOpportunity: boolean;
  hasBarbarianTarget: boolean;
  hasWeakEnemyBorder: boolean;
  attackReady: boolean;
  needsSettlement: boolean;
  frontierDebtHigh: boolean;
  foodCoverageLow: boolean;
  underThreat: boolean;
  threatCritical: boolean;
  economyWeak: boolean;
  needsFortifiedAnchor: boolean;
  canAffordFrontierAction: boolean;
  canAffordSettlement: boolean;
  canBuildFort: boolean;
  canBuildEconomy: boolean;
  goldHealthy: boolean;
  staminaHealthy: boolean;
}

export type AiSeasonVictoryPathId = "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY";

export interface AiSeasonVictorySnapshot {
  townsControlled: number;
  townsTarget: number;
  incomePerMinute: number;
  incomeLeaderGap: number;
  settledTiles: number;
  settledTilesTarget: number;
  underThreat: boolean;
  goldHealthy: boolean;
  staminaHealthy: boolean;
}

export interface AiVictoryPathScore {
  id: AiSeasonVictoryPathId;
  score: number;
  rationale: string;
}

export type AiEmpireGoalId =
  | "fortify_core_chokepoint"
  | "secure_food_supply"
  | "secure_core_income"
  | "stabilize_reserves"
  | "expand_vision_for_value"
  | "clear_barbarian_pressure"
  | "settle_high_value_frontier"
  | "secure_high_value_frontier"
  | "remove_core_threat"
  | "season_town_control"
  | "season_settled_territory"
  | "season_economic_hegemony";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const rankSeasonVictoryPaths = (snapshot: AiSeasonVictorySnapshot): AiVictoryPathScore[] => {
  const townProgress = snapshot.townsTarget > 0 ? clamp01(snapshot.townsControlled / snapshot.townsTarget) : 0;
  const settledProgress = snapshot.settledTilesTarget > 0 ? clamp01(snapshot.settledTiles / snapshot.settledTilesTarget) : 0;
  const incomePressure = snapshot.incomeLeaderGap >= 0 ? 1 : clamp01(1 - Math.min(1, Math.abs(snapshot.incomeLeaderGap) / 80));

  const ranked: AiVictoryPathScore[] = [
    {
      id: "TOWN_CONTROL",
      score: townProgress * 100 + (snapshot.goldHealthy ? 10 : -15) + (snapshot.staminaHealthy ? 8 : -10) + (snapshot.underThreat ? -20 : 0),
      rationale: `town progress ${snapshot.townsControlled}/${snapshot.townsTarget}`
    },
    {
      id: "SETTLED_TERRITORY",
      score: settledProgress * 100 + (snapshot.goldHealthy ? 8 : -8) + (snapshot.staminaHealthy ? 6 : -10) + (snapshot.underThreat ? -12 : 0),
      rationale: `settled land ${snapshot.settledTiles}/${snapshot.settledTilesTarget}`
    },
    {
      id: "ECONOMIC_HEGEMONY",
      score:
        incomePressure * 100 +
        Math.min(snapshot.incomePerMinute, 240) * 0.45 +
        (snapshot.incomePerMinute >= 200 ? 18 : -18) +
        (snapshot.goldHealthy ? 12 : -8) +
        (snapshot.underThreat ? -12 : 4),
      rationale:
        snapshot.incomeLeaderGap >= 0
          ? `income ${snapshot.incomePerMinute.toFixed(1)} gold/m with lead established`
          : `${Math.abs(snapshot.incomeLeaderGap).toFixed(1)} gold/m behind the leader`
    }
  ];

  return ranked.sort((a, b) => b.score - a.score);
};

export const AI_EMPIRE_ACTIONS: readonly GoapAction<AiEmpireGoapState>[] = [
  {
    key: "claim_food_border_tile",
    cost: 1,
    preconditions: {
      hasNeutralLandOpportunity: true,
      foodCoverageLow: true,
      canAffordFrontierAction: true,
      staminaHealthy: true
    },
    effects: {
      hasNeutralLandOpportunity: false,
      foodCoverageLow: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["secure_food_supply", "secure_high_value_frontier", "season_economic_hegemony"],
      description: "Claim frontier toward food-supporting economic land."
    }
  },
  {
    key: "claim_neutral_border_tile",
    cost: 2,
    preconditions: {
      hasNeutralLandOpportunity: true,
      canAffordFrontierAction: true,
      staminaHealthy: true
    },
    effects: {
      hasNeutralLandOpportunity: false,
      hasScoutOpportunity: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["secure_high_value_frontier", "season_town_control", "season_settled_territory", "season_economic_hegemony"],
      description: "Claim an adjacent neutral tile."
    }
  },
  {
    key: "claim_scout_border_tile",
    cost: 4,
    preconditions: {
      hasScoutOpportunity: true,
      canAffordFrontierAction: true,
      staminaHealthy: true,
      economyWeak: false,
      underThreat: false
    },
    effects: {
      hasScoutOpportunity: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["expand_vision_for_value", "secure_high_value_frontier", "season_town_control", "season_settled_territory", "season_economic_hegemony"],
      description: "Probe outward to reveal promising land."
    }
  },
  {
    key: "claim_scaffold_border_tile",
    cost: 2,
    preconditions: {
      hasScaffoldOpportunity: true,
      canAffordFrontierAction: true,
      staminaHealthy: true
    },
    effects: {
      hasScaffoldOpportunity: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["settle_high_value_frontier", "secure_high_value_frontier", "season_settled_territory", "season_economic_hegemony"],
      description: "Claim a border tile that sets up a strong settlement scaffold."
    }
  },
  {
    key: "attack_barbarian_border_tile",
    cost: 3,
    preconditions: {
      hasBarbarianTarget: true,
      canAffordFrontierAction: true,
      staminaHealthy: true
    },
    effects: {
      hasBarbarianTarget: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["clear_barbarian_pressure", "season_town_control", "season_economic_hegemony"],
      description: "Clear a barbarian border tile."
    }
  },
  {
    key: "attack_enemy_border_tile",
    cost: 5,
    preconditions: {
      hasWeakEnemyBorder: true,
      attackReady: true,
      canAffordFrontierAction: true,
      staminaHealthy: true
    },
    effects: {
      hasWeakEnemyBorder: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["remove_core_threat", "season_town_control"],
      description: "Push a weak neighboring border."
    }
  },
  {
    key: "settle_owned_frontier_tile",
    cost: 2,
    preconditions: {
      needsSettlement: true,
      canAffordSettlement: true
    },
    effects: {
      needsSettlement: false,
      foodCoverageLow: false
    },
    meta: {
      goalIds: ["settle_high_value_frontier", "secure_food_supply", "secure_core_income", "season_settled_territory", "season_economic_hegemony"],
      description: "Convert frontier territory into durable settled land."
    }
  },
  {
    key: "build_fort_on_exposed_tile",
    cost: 3,
    preconditions: {
      underThreat: true,
      canBuildFort: true
    },
    effects: {
      underThreat: false,
      needsFortifiedAnchor: false
    },
    meta: {
      goalIds: ["fortify_core_chokepoint", "season_town_control", "season_settled_territory", "season_economic_hegemony"],
      description: "Place a fort to stabilize an exposed edge."
    }
  },
  {
    key: "build_economic_structure",
    cost: 2,
    preconditions: {
      canBuildEconomy: true,
      goldHealthy: true,
      underThreat: false
    },
    effects: {
      economyWeak: false
    },
    meta: {
      goalIds: ["secure_core_income", "season_economic_hegemony"],
      description: "Improve recurring income on secure territory."
    }
  },
  {
    key: "wait_and_recover",
    cost: 1,
    preconditions: {},
    effects: {
      canAffordFrontierAction: true,
      canAffordSettlement: true,
      goldHealthy: true,
      staminaHealthy: true
    },
    meta: {
      goalIds: ["stabilize_reserves"],
      description: "Spend a tick recovering instead of forcing a bad move."
    }
  }
];

export const AI_EMPIRE_GOALS: readonly GoapGoal<AiEmpireGoapState>[] = [
  {
    id: "fortify_core_chokepoint",
    priority: 11,
    desired: { underThreat: false, needsFortifiedAnchor: false }
  },
  {
    id: "secure_food_supply",
    priority: 11,
    desired: { foodCoverageLow: false }
  },
  {
    id: "secure_core_income",
    priority: 10,
    desired: { economyWeak: false }
  },
  {
    id: "stabilize_reserves",
    priority: 8,
    desired: { goldHealthy: true, staminaHealthy: true }
  },
  {
    id: "expand_vision_for_value",
    priority: 8,
    desired: { hasScoutOpportunity: false }
  },
  {
    id: "secure_high_value_frontier",
    priority: 9,
    desired: { hasNeutralLandOpportunity: false, hasScaffoldOpportunity: false }
  },
  {
    id: "clear_barbarian_pressure",
    priority: 7,
    desired: { hasBarbarianTarget: false }
  },
  {
    id: "settle_high_value_frontier",
    priority: 9,
    desired: { needsSettlement: false }
  },
  {
    id: "remove_core_threat",
    priority: 10,
    desired: { hasWeakEnemyBorder: false, threatCritical: false }
  }
];

const SEASON_GOAL_BY_VICTORY_PATH: Record<AiSeasonVictoryPathId, GoapGoal<AiEmpireGoapState>> = {
  TOWN_CONTROL: {
    id: "season_town_control",
    priority: 12,
    desired: { hasWeakEnemyBorder: false, threatCritical: false }
  },
  SETTLED_TERRITORY: {
    id: "season_settled_territory",
    priority: 12,
    desired: { needsSettlement: false }
  },
  ECONOMIC_HEGEMONY: {
    id: "season_economic_hegemony",
    priority: 13,
    desired: { economyWeak: false, foodCoverageLow: false }
  }
};

const GOAL_PRIORITY_BONUSES: Partial<Record<AiSeasonVictoryPathId, Partial<Record<AiEmpireGoalId, number>>>> = {
  TOWN_CONTROL: {
    season_town_control: 5,
    secure_food_supply: 2,
    expand_vision_for_value: 2,
    secure_high_value_frontier: 2,
    remove_core_threat: 4,
    secure_core_income: 1,
    fortify_core_chokepoint: 2,
    settle_high_value_frontier: 1
  },
  SETTLED_TERRITORY: {
    season_settled_territory: 5,
    secure_food_supply: 3,
    expand_vision_for_value: 1,
    secure_high_value_frontier: 4,
    settle_high_value_frontier: 5,
    secure_core_income: 2,
    fortify_core_chokepoint: 1,
    stabilize_reserves: 1
  },
  ECONOMIC_HEGEMONY: {
    season_economic_hegemony: 6,
    secure_food_supply: 7,
    expand_vision_for_value: 3,
    secure_core_income: 5,
    settle_high_value_frontier: 5,
    secure_high_value_frontier: 4,
    clear_barbarian_pressure: 1,
    stabilize_reserves: -2
  }
};

export const goalsForVictoryPath = (victoryPath?: AiSeasonVictoryPathId): GoapGoal<AiEmpireGoapState>[] => {
  const goals: GoapGoal<AiEmpireGoapState>[] = [...AI_EMPIRE_GOALS];
  if (victoryPath) goals.unshift(SEASON_GOAL_BY_VICTORY_PATH[victoryPath]);
  const bonuses = victoryPath ? GOAL_PRIORITY_BONUSES[victoryPath] ?? {} : {};
  return goals.map((goal) => ({
    ...goal,
    priority: goal.priority + (bonuses[goal.id as AiEmpireGoalId] ?? 0)
  }));
};
