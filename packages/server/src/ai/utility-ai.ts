import type {
  AiDoctrineDecision,
  AiDoctrineId,
  AiRewriteBudgetTarget,
  AiRewriteContext,
  AiRewriteDecision,
  AiRewriteEvaluation,
  AiRewriteIntentKey,
  AiRewriteCompetency
} from "./rewrite-types.js";
import { chooseAiStrategicDoctrine } from "./strategic-doctrine.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const growthProgress = (current: number, target: number): number => {
  if (target <= 0) return 0;
  return clamp(current / target, 0, 1);
};

const victoryLead = (ctx: AiRewriteContext): number => ctx.aiIncome - ctx.runnerUpIncome;
const openingGrowthPhase = (ctx: AiRewriteContext): boolean => ctx.controlledTowns === 0 || ctx.settledTiles < 6;

export const AI_REWRITE_COMPETENCIES: AiRewriteCompetency[] = [
  { key: "choose_victory_path", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "expand_economic_frontier", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "expand_scout_frontier", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "expand_scaffold_frontier", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "attack_barbarian_border", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "attack_enemy_border", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "settle_frontier", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "settle_town_support", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "settle_island", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "build_fort", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "build_economic_structure", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "collect_shard", currentSurface: "main.ts", requiredForCompetentPlay: false },
  { key: "manage_truce", currentSurface: "main.ts", requiredForCompetentPlay: false },
  { key: "pick_tech", currentSurface: "main.ts", requiredForCompetentPlay: true },
  { key: "pick_domain", currentSurface: "main.ts", requiredForCompetentPlay: true }
];

export const defaultAiRewriteBudget = (): AiRewriteBudgetTarget => ({
  targetAiCount: 100,
  targetCpuMHz: 1000,
  targetMemoryMb: 512,
  policyBudgetMsPerAi: 0.25,
  policyBudgetMsPerBatch: 25,
  transientAllocationBudgetMb: 2.5
});

const doctrineBonus = (doctrineId: AiDoctrineId, intent: AiRewriteIntentKey): number => {
  switch (doctrineId) {
    case "CRISIS_STABILIZE":
      if (intent === "SURVIVE") return 42;
      if (intent === "RECOVER_ECONOMY") return 18;
      if (intent === "FORTIFY_CHOKEPOINT") return 12;
      return 0;
    case "ECONOMIC_SCALING":
      if (intent === "RECOVER_ECONOMY") return 30;
      if (intent === "EXPAND_FRONTIER") return 18;
      if (intent === "SETTLE_FRONTIER") return 12;
      return 0;
    case "ISLAND_EXPANSION":
      if (intent === "SETTLE_FRONTIER") return 24;
      if (intent === "EXPAND_FRONTIER") return 22;
      return 0;
    case "TOWN_ASSAULT":
      if (intent === "PRESSURE_ENEMY") return 32;
      if (intent === "FORTIFY_CHOKEPOINT") return 10;
      return 0;
    case "BORDER_PRESSURE":
      if (intent === "PRESSURE_ENEMY") return 20;
      if (intent === "CLEAR_BARBARIANS") return 14;
      if (intent === "EXPAND_FRONTIER") return 10;
      return 0;
    case "DIPLOMATIC_RESET":
      if (intent === "MANAGE_TRUCE") return 36;
      if (intent === "SURVIVE") return 10;
      return 0;
    case "CONSOLIDATE":
      if (intent === "WAIT") return 18;
      if (intent === "RECOVER_ECONOMY") return 10;
      return 0;
  }
};

const scoreIntent = (ctx: AiRewriteContext, intent: AiRewriteIntentKey, doctrineId: AiDoctrineId): number => {
  const townProgress = growthProgress(ctx.controlledTowns, ctx.townsTarget);
  const settledProgress = growthProgress(ctx.settledTiles, ctx.settledTilesTarget);
  const incomeLead = victoryLead(ctx);
  const opening = openingGrowthPhase(ctx);
  switch (intent) {
    case "SURVIVE":
      return (
        (ctx.underThreat ? 60 : 0) +
        (ctx.threatCritical ? 80 : 0) +
        (ctx.pendingCaptures > 0 ? 25 : 0) +
        (ctx.pressureThreatensCore ? 55 : 0) +
        (ctx.frontPosture === "TRUCE" ? 20 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "RECOVER_ECONOMY":
      return (
        (opening ? 18 : 0) +
        (ctx.economyWeak ? 70 : 0) +
        (ctx.foodCoverageLow ? 55 : 0) +
        (ctx.economicBuildAvailable && ctx.canBuildEconomy ? 35 : 0) +
        (ctx.economicExpandAvailable && ctx.canAffordFrontierAction ? 25 : 0) +
        clamp(18 - ctx.aiIncome, 0, 18) * 2 +
        doctrineBonus(doctrineId, intent)
      );
    case "EXPAND_FRONTIER":
      return (
        (opening ? 62 : 0) +
        (ctx.controlledTowns === 0 ? 22 : 0) +
        (ctx.neutralExpandAvailable ? 26 : 0) +
        (ctx.economicExpandAvailable ? 32 : 0) +
        (ctx.scoutExpandAvailable ? 12 : 0) +
        (ctx.scaffoldExpandAvailable ? 10 : 0) +
        (ctx.islandExpandAvailable ? 18 : 0) +
        (ctx.canAffordFrontierAction ? 20 : -40) +
        (ctx.frontierDebt ? -18 : 6) +
        (ctx.primaryVictoryPath === "SETTLED_TERRITORY" ? (1 - settledProgress) * 40 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "SETTLE_FRONTIER":
      return (
        (opening ? 58 : 0) +
        (ctx.controlledTowns === 0 ? 36 : 0) +
        (ctx.settlementAvailable ? 45 : -40) +
        (ctx.townSupportSettlementAvailable ? 24 : 0) +
        (ctx.islandSettlementAvailable ? 16 : 0) +
        (ctx.canAffordSettlement ? 24 : -40) +
        (ctx.foodCoverageLow ? 18 : 0) +
        (ctx.primaryVictoryPath === "SETTLED_TERRITORY" ? (1 - settledProgress) * 50 : 8) +
        doctrineBonus(doctrineId, intent)
      );
    case "FORTIFY_CHOKEPOINT":
      return (
        (opening && !ctx.underThreat ? -18 : 0) +
        (ctx.fortAvailable ? 20 : -30) +
        (ctx.canBuildFort ? 24 : -30) +
        (ctx.fortProtectsCore ? 38 : 0) +
        (ctx.fortIsDockChokePoint ? 22 : 0) +
        (ctx.underThreat ? 26 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "PRESSURE_ENEMY":
      return (
        (opening ? -85 : 0) +
        (ctx.aiIncome < 12 ? -24 : 0) +
        (ctx.controlledTowns < 2 ? -18 : 0) +
        (ctx.enemyAttackAvailable ? 26 : -20) +
        (ctx.pressureAttackScore > 0 ? Math.min(70, ctx.pressureAttackScore / 8) : -15) +
        (ctx.canAffordFrontierAction ? 18 : -40) +
        (ctx.frontPosture === "BREAK" ? 28 : 0) +
        (ctx.primaryVictoryPath === "TOWN_CONTROL" ? (1 - townProgress) * 40 : 0) +
        (incomeLead > 0 ? 8 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "CLEAR_BARBARIANS":
      return (
        (opening && ctx.controlledTowns > 0 ? -10 : 0) +
        (ctx.barbarianAttackAvailable ? 34 : -20) +
        (ctx.canAffordFrontierAction ? 14 : -30) +
        (ctx.underThreat ? 10 : 0) +
        (ctx.controlledTowns === 0 ? 8 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "COLLECT_SHARD":
      return (
        (ctx.shardAvailable ? 35 : -20) +
        (ctx.strategicFocus === "SHARD_RUSH" ? 32 : 0) +
        (!ctx.underThreat ? 15 : -12) +
        (!ctx.foodCoverageLow ? 10 : -8) +
        (!ctx.economyWeak ? 10 : -8) +
        doctrineBonus(doctrineId, intent)
      );
    case "MANAGE_TRUCE":
      return (
        ((ctx.truceRequestAvailable || ctx.truceAcceptanceAvailable) ? 24 : -25) +
        (ctx.frontPosture === "TRUCE" ? 40 : 0) +
        (ctx.underThreat && ctx.economyWeak ? 18 : 0) +
        (ctx.pressureAttackScore > 0 && !ctx.pressureThreatensCore ? 8 : 0) +
        doctrineBonus(doctrineId, intent)
      );
    case "WAIT":
      return (
        (opening ? -30 : 0) +
        1 +
        (ctx.pendingSettlement ? 18 : 0) +
        (ctx.pendingCaptures > 0 ? 12 : 0) +
        (ctx.workerQueueBackpressure || ctx.simulationQueueBackpressure ? 32 : 0) +
        doctrineBonus(doctrineId, intent)
      );
  }
};

export const rankAiRewriteUtility = (ctx: AiRewriteContext, doctrineDecision?: AiDoctrineDecision): AiRewriteDecision["utility"] => {
  const doctrine = doctrineDecision ?? chooseAiStrategicDoctrine(ctx);
  const intents: AiRewriteIntentKey[] = [
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
  ];

  return intents
    .map((intent) => ({
      intent,
      score: scoreIntent(ctx, intent, doctrine.doctrineId),
      reason: intent.toLowerCase()
    }))
    .sort((left, right) => right.score - left.score);
};

export const chooseAiRewriteIntent = (ctx: AiRewriteContext, doctrineDecision?: AiDoctrineDecision): AiRewriteDecision => {
  const doctrine = doctrineDecision ?? chooseAiStrategicDoctrine(ctx);
  const utility = rankAiRewriteUtility(ctx, doctrine);
  const best = utility[0];
  return {
    doctrine,
    intent: best?.intent ?? "WAIT",
    reason: best?.reason ?? "wait",
    utility
  };
};

export const createAiRewriteEvaluation = (): AiRewriteEvaluation => ({
  competencies: AI_REWRITE_COMPETENCIES,
  budget: defaultAiRewriteBudget(),
  rolloutPhases: [
    "Phase 0: shadow brain and benchmark",
    "Phase 1: adapter from current planning snapshot",
    "Phase 2: live intent cutover",
    "Phase 3: selector replacement"
  ]
});
