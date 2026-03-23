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
  hasBarbarianTarget: boolean;
  hasWeakEnemyBorder: boolean;
  needsSettlement: boolean;
  underThreat: boolean;
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
    key: "claim_neutral_border_tile",
    cost: 2,
    preconditions: {
      hasNeutralLandOpportunity: true,
      goldHealthy: true,
      staminaHealthy: true
    },
    effects: {
      needsSettlement: true
    },
    meta: {
      goalIds: ["expand_frontier"],
      description: "Claim an adjacent neutral tile."
    }
  },
  {
    key: "attack_barbarian_border_tile",
    cost: 3,
    preconditions: {
      hasBarbarianTarget: true,
      goldHealthy: true,
      staminaHealthy: true
    },
    effects: {
      hasBarbarianTarget: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["clear_barbarians"],
      description: "Clear a barbarian border tile."
    }
  },
  {
    key: "attack_enemy_border_tile",
    cost: 5,
    preconditions: {
      hasWeakEnemyBorder: true,
      goldHealthy: true,
      staminaHealthy: true,
      underThreat: false
    },
    effects: {
      hasWeakEnemyBorder: false,
      needsSettlement: true
    },
    meta: {
      goalIds: ["harass_enemy_border"],
      description: "Push a weak neighboring border."
    }
  },
  {
    key: "settle_owned_frontier_tile",
    cost: 2,
    preconditions: {
      needsSettlement: true,
      goldHealthy: true
    },
    effects: {
      needsSettlement: false
    },
    meta: {
      goalIds: ["settle_interior"],
      description: "Convert frontier territory into durable settled land."
    }
  },
  {
    key: "build_fort_on_exposed_tile",
    cost: 3,
    preconditions: {
      underThreat: true,
      canBuildFort: true,
      goldHealthy: true
    },
    effects: {
      underThreat: false
    },
    meta: {
      goalIds: ["fortify_capital"],
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
    effects: {},
    meta: {
      goalIds: ["grow_income"],
      description: "Improve recurring income on secure territory."
    }
  },
  {
    key: "wait_and_recover",
    cost: 1,
    preconditions: {},
    effects: {
      goldHealthy: true,
      staminaHealthy: true
    },
    meta: {
      goalIds: ["recover_resources", "fortify_capital"],
      description: "Spend a tick recovering instead of forcing a bad move."
    }
  }
];

export const AI_EMPIRE_GOALS: readonly GoapGoal<AiEmpireGoapState>[] = [
  {
    id: "fortify_capital",
    priority: 9,
    desired: { underThreat: false }
  },
  {
    id: "recover_resources",
    priority: 8,
    desired: { goldHealthy: true, staminaHealthy: true }
  },
  {
    id: "clear_barbarians",
    priority: 7,
    desired: { hasBarbarianTarget: false }
  },
  {
    id: "settle_interior",
    priority: 6,
    desired: { needsSettlement: false }
  },
  {
    id: "expand_frontier",
    priority: 5,
    desired: { needsSettlement: true }
  },
  {
    id: "harass_enemy_border",
    priority: 4,
    desired: { hasWeakEnemyBorder: false }
  }
];

export const goalsForVictoryPath = (victoryPath?: AiSeasonVictoryPathId): GoapGoal<AiEmpireGoapState>[] => {
  return AI_EMPIRE_GOALS.map((goal) => {
    let priority = goal.priority;
    if (victoryPath === "TOWN_CONTROL") {
      if (goal.id === "expand_frontier") priority += 3;
      if (goal.id === "harass_enemy_border") priority += 2;
      if (goal.id === "fortify_capital") priority += 1;
    } else if (victoryPath === "SETTLED_TERRITORY") {
      if (goal.id === "expand_frontier") priority += 2;
      if (goal.id === "settle_interior") priority += 4;
      if (goal.id === "recover_resources") priority += 1;
    } else if (victoryPath === "ECONOMIC_HEGEMONY") {
      if (goal.id === "grow_income") priority += 4;
      if (goal.id === "settle_interior") priority += 2;
      if (goal.id === "clear_barbarians") priority += 1;
    }
    return { ...goal, priority };
  });
};
