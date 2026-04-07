import type { AiDoctrineDecision, AiDoctrineId, AiRewriteContext } from "./rewrite-types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const growthProgress = (current: number, target: number): number => {
  if (target <= 0) return 0;
  return clamp(current / target, 0, 1);
};

const inOpeningGrowthPhase = (ctx: AiRewriteContext): boolean => ctx.controlledTowns === 0 || ctx.settledTiles < 6;

export const doctrineInvalidationSignature = (ctx: AiRewriteContext): string => {
  const townProgressBucket = Math.floor(growthProgress(ctx.controlledTowns, ctx.townsTarget) * 4);
  const settledProgressBucket = Math.floor(growthProgress(ctx.settledTiles, ctx.settledTilesTarget) * 4);
  const incomeBucket = Math.floor(Math.max(0, Math.min(40, ctx.aiIncome)) / 5);
  const pressureBucket = Math.floor(Math.max(0, Math.min(400, ctx.pressureAttackScore)) / 50);
  return [
    ctx.primaryVictoryPath ?? "none",
    ctx.strategicFocus,
    ctx.frontPosture,
    townProgressBucket,
    settledProgressBucket,
    incomeBucket,
    pressureBucket,
    ctx.underThreat ? 1 : 0,
    ctx.threatCritical ? 1 : 0,
    ctx.economyWeak ? 1 : 0,
    ctx.foodCoverageLow ? 1 : 0,
    ctx.pressureThreatensCore ? 1 : 0,
    ctx.undercoveredIslandCount > 0 ? 1 : 0,
    ctx.enemyAttackAvailable ? 1 : 0,
    ctx.barbarianAttackAvailable ? 1 : 0,
    ctx.islandExpandAvailable ? 1 : 0,
    ctx.islandSettlementAvailable ? 1 : 0,
    ctx.truceRequestAvailable || ctx.truceAcceptanceAvailable ? 1 : 0,
    ctx.workerQueueBackpressure || ctx.simulationQueueBackpressure ? 1 : 0
  ].join("|");
};

const doctrineScore = (ctx: AiRewriteContext, doctrineId: AiDoctrineId, currentDoctrineId?: AiDoctrineId): number => {
  const stickinessBonus = currentDoctrineId === doctrineId ? 8 : 0;
  const townProgress = growthProgress(ctx.controlledTowns, ctx.townsTarget);
  const settledProgress = growthProgress(ctx.settledTiles, ctx.settledTilesTarget);
  const openingGrowthPhase = inOpeningGrowthPhase(ctx);

  switch (doctrineId) {
    case "CRISIS_STABILIZE":
      return (
        (ctx.underThreat ? 75 : 0) +
        (ctx.threatCritical ? 95 : 0) +
        (ctx.pressureThreatensCore ? 60 : 0) +
        (ctx.economyWeak ? 25 : 0) +
        (ctx.foodCoverageLow ? 20 : 0) +
        stickinessBonus
      );
    case "ECONOMIC_SCALING":
      return (
        (openingGrowthPhase ? 60 : 0) +
        (ctx.economyWeak ? 55 : 0) +
        (ctx.canBuildEconomy && ctx.economicBuildAvailable ? 35 : 0) +
        (ctx.economicExpandAvailable ? 22 : 0) +
        (ctx.settlementAvailable ? 18 : 0) +
        (ctx.primaryVictoryPath === "ECONOMIC_HEGEMONY" ? 28 : 0) +
        clamp(20 - ctx.aiIncome, 0, 20) * 1.5 +
        stickinessBonus
      );
    case "ISLAND_EXPANSION":
      return (
        (openingGrowthPhase && ctx.primaryVictoryPath === "SETTLED_TERRITORY" ? 24 : 0) +
        (ctx.undercoveredIslandCount > 0 ? 45 : 0) +
        (ctx.islandExpandAvailable ? 30 : 0) +
        (ctx.islandSettlementAvailable ? 26 : 0) +
        (ctx.primaryVictoryPath === "SETTLED_TERRITORY" ? (1 - settledProgress) * 45 : 0) +
        (ctx.strategicFocus === "ISLAND_FOOTPRINT" ? 20 : 0) +
        stickinessBonus
      );
    case "TOWN_ASSAULT":
      return (
        (openingGrowthPhase ? -70 : 0) +
        (ctx.aiIncome < 12 ? -25 : 0) +
        (ctx.controlledTowns < 2 ? -20 : 0) +
        (ctx.enemyAttackAvailable ? 30 : -15) +
        Math.min(55, ctx.pressureAttackScore / 9) +
        (ctx.primaryVictoryPath === "TOWN_CONTROL" ? (1 - townProgress) * 60 : 0) +
        (ctx.frontPosture === "BREAK" ? 22 : 0) +
        stickinessBonus
      );
    case "BORDER_PRESSURE":
      return (
        (openingGrowthPhase ? -45 : 0) +
        (ctx.enemyAttackAvailable ? 20 : -10) +
        (ctx.barbarianAttackAvailable ? 12 : 0) +
        (ctx.neutralExpandAvailable ? 15 : 0) +
        (ctx.scoutExpandAvailable ? 10 : 0) +
        (ctx.strategicFocus === "MILITARY_PRESSURE" ? 22 : 0) +
        stickinessBonus
      );
    case "DIPLOMATIC_RESET":
      return (
        (ctx.frontPosture === "TRUCE" ? 45 : 0) +
        ((ctx.truceRequestAvailable || ctx.truceAcceptanceAvailable) ? 30 : -10) +
        (ctx.underThreat && ctx.economyWeak ? 28 : 0) +
        (ctx.pendingCaptures > 0 ? 8 : 0) +
        stickinessBonus
      );
    case "CONSOLIDATE":
      return (
        (openingGrowthPhase ? -35 : 0) +
        (ctx.pendingSettlement ? 20 : 0) +
        (ctx.pendingCaptures > 0 ? 12 : 0) +
        (ctx.workerQueueBackpressure || ctx.simulationQueueBackpressure ? 35 : 0) +
        (!ctx.underThreat ? 8 : 0) +
        (!ctx.economyWeak ? 8 : 0) +
        stickinessBonus
      );
  }
};

export const chooseAiStrategicDoctrine = (ctx: AiRewriteContext, currentDoctrineId?: AiDoctrineId): AiDoctrineDecision => {
  const doctrines: AiDoctrineId[] = [
    "CRISIS_STABILIZE",
    "ECONOMIC_SCALING",
    "ISLAND_EXPANSION",
    "TOWN_ASSAULT",
    "BORDER_PRESSURE",
    "DIPLOMATIC_RESET",
    "CONSOLIDATE"
  ];

  const options = doctrines
    .map((id) => ({
      id,
      score: doctrineScore(ctx, id, currentDoctrineId),
      reason: id.toLowerCase()
    }))
    .sort((left, right) => right.score - left.score);

  const best = options[0];
  return {
    doctrineId: best?.id ?? "CONSOLIDATE",
    reason: best?.reason ?? "consolidate",
    options
  };
};
