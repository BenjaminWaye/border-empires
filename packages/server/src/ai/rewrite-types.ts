export const AI_REWRITE_INTENT_KEYS = [
  "SURVIVE",
  "RECOVER_ECONOMY",
  "EXPAND_FRONTIER",
  "SETTLE_FRONTIER",
  "FORTIFY_CHOKEPOINT",
  "PRESSURE_ENEMY",
  "CLEAR_BARBARIANS",
  "COLLECT_SHARD",
  "MANAGE_TRUCE",
  "WAIT"
] as const;

export type AiRewriteIntentKey = (typeof AI_REWRITE_INTENT_KEYS)[number];

export type AiRewriteCompetencyKey =
  | "choose_victory_path"
  | "expand_economic_frontier"
  | "expand_scout_frontier"
  | "expand_scaffold_frontier"
  | "attack_barbarian_border"
  | "attack_enemy_border"
  | "settle_frontier"
  | "settle_town_support"
  | "settle_island"
  | "build_fort"
  | "build_economic_structure"
  | "collect_shard"
  | "manage_truce"
  | "pick_tech"
  | "pick_domain";

export type AiRewriteCompetency = {
  key: AiRewriteCompetencyKey;
  currentSurface: "main.ts" | "planner-shared.ts" | "goap.ts" | "sim/service.ts";
  requiredForCompetentPlay: boolean;
};

export type AiRewriteContext = {
  primaryVictoryPath?: "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY";
  strategicFocus:
    | "BALANCED"
    | "ECONOMIC_RECOVERY"
    | "ISLAND_FOOTPRINT"
    | "MILITARY_PRESSURE"
    | "BORDER_CONTAINMENT"
    | "SHARD_RUSH";
  frontPosture: "BREAK" | "CONTAIN" | "TRUCE";
  aiCount: number;
  points: number;
  stamina: number;
  aiIncome: number;
  runnerUpIncome: number;
  controlledTowns: number;
  townsTarget: number;
  settledTiles: number;
  settledTilesTarget: number;
  frontierTiles: number;
  underThreat: boolean;
  threatCritical: boolean;
  economyWeak: boolean;
  frontierDebt: boolean;
  foodCoverage: number;
  foodCoverageLow: boolean;
  pressureAttackScore: number;
  pressureThreatensCore: boolean;
  undercoveredIslandCount: number;
  weakestIslandRatio: number;
  canAffordFrontierAction: boolean;
  canAffordSettlement: boolean;
  canBuildFort: boolean;
  canBuildEconomy: boolean;
  openingScoutAvailable: boolean;
  economicExpandAvailable: boolean;
  neutralExpandAvailable: boolean;
  scoutExpandAvailable: boolean;
  scaffoldExpandAvailable: boolean;
  barbarianAttackAvailable: boolean;
  enemyAttackAvailable: boolean;
  settlementAvailable: boolean;
  townSupportSettlementAvailable: boolean;
  islandSettlementAvailable: boolean;
  islandExpandAvailable: boolean;
  fortAvailable: boolean;
  fortProtectsCore: boolean;
  fortIsDockChokePoint: boolean;
  economicBuildAvailable: boolean;
  shardAvailable: boolean;
  truceRequestAvailable: boolean;
  truceAcceptanceAvailable: boolean;
  pendingCaptures: number;
  pendingSettlement: boolean;
  simulationQueueBackpressure: boolean;
  workerQueueBackpressure: boolean;
};

export type AiUtilityOption = {
  intent: AiRewriteIntentKey;
  score: number;
  reason: string;
};

export const AI_DOCTRINE_IDS = [
  "CRISIS_STABILIZE",
  "ECONOMIC_SCALING",
  "ISLAND_EXPANSION",
  "TOWN_ASSAULT",
  "BORDER_PRESSURE",
  "DIPLOMATIC_RESET",
  "CONSOLIDATE"
] as const;

export type AiDoctrineId = (typeof AI_DOCTRINE_IDS)[number];

export type AiDoctrineOption = {
  id: AiDoctrineId;
  score: number;
  reason: string;
};

export type AiDoctrineDecision = {
  doctrineId: AiDoctrineId;
  reason: string;
  options: AiDoctrineOption[];
};

export type AiRewriteDecision = {
  doctrine: AiDoctrineDecision;
  intent: AiRewriteIntentKey;
  reason: string;
  utility: AiUtilityOption[];
};

export type AiRewriteBudgetTarget = {
  targetAiCount: number;
  targetCpuMHz: number;
  targetMemoryMb: number;
  policyBudgetMsPerAi: number;
  policyBudgetMsPerBatch: number;
  transientAllocationBudgetMb: number;
};

export type AiRewriteEvaluation = {
  competencies: AiRewriteCompetency[];
  budget: AiRewriteBudgetTarget;
  rolloutPhases: string[];
};
