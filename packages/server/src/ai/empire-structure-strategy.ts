import type { EconomicStructureType, PopulationTier, ResourceType } from "@border-empires/shared";

export type AiEconomicStructureContext = {
  economicVictoryBias: boolean;
  foodCoverageLow: boolean;
  economyWeak: boolean;
  openingGrowthPhase: boolean;
  underThreat: boolean;
};

export type AiEconomicStructureCandidate = {
  tileIndex: number;
  allowedStructureTypes?: EconomicStructureType[];
  resource?: ResourceType;
  isTown: boolean;
  townPopulationTier?: PopulationTier;
  isDock: boolean;
  supportedTownCount: number;
  supportedDockCount: number;
  connectedTownCount: number;
  connectedDockCount: number;
  townIncomePerMinute: number;
  dockIncomePerMinute: number;
};

export type AiEconomicStructurePlan = {
  tileIndex: number;
  structureType: EconomicStructureType;
  score: number;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const scoreTownCommercialValue = (candidate: AiEconomicStructureCandidate): number =>
  candidate.isTown
    ? 55 +
      candidate.connectedTownCount * 26 +
      candidate.supportedTownCount * 18 +
      clamp(candidate.townIncomePerMinute, 0, 16) * 8
    : 0;

export const structureTypesForEconomicCandidate = (candidate: AiEconomicStructureCandidate): EconomicStructureType[] => {
  if (candidate.allowedStructureTypes) return [...candidate.allowedStructureTypes];
  const types = new Set<EconomicStructureType>();
  if (candidate.resource === "FARM" || candidate.resource === "FISH") {
    types.add("FARMSTEAD");
    types.add("GRANARY");
  }
  if (candidate.resource === "FUR" || candidate.resource === "WOOD") {
    types.add("CAMP");
    types.add("MARKET");
  }
  if (candidate.resource === "IRON" || candidate.resource === "GEMS") {
    types.add("MINE");
    types.add("MARKET");
  }
  if (candidate.isTown) {
    types.add("MARKET");
    types.add("GRANARY");
    if (candidate.townPopulationTier && candidate.townPopulationTier !== "SETTLEMENT") types.add("BANK");
    if (candidate.connectedTownCount >= 2 || candidate.supportedTownCount >= 2) types.add("GOVERNORS_OFFICE");
  }
  if (candidate.isDock || candidate.supportedDockCount > 0 || candidate.connectedDockCount > 0) {
    types.add("CUSTOMS_HOUSE");
  }
  return [...types];
};

export const scoreAiEconomicStructureCandidate = (
  ctx: AiEconomicStructureContext,
  candidate: AiEconomicStructureCandidate,
  structureType: EconomicStructureType
): number => {
  const townCommercialValue = scoreTownCommercialValue(candidate);
  const dockTradeValue =
    (candidate.isDock ? 140 : 0) +
    candidate.supportedDockCount * 34 +
    candidate.connectedDockCount * 72 +
    clamp(candidate.dockIncomePerMinute, 0, 12) * 18;
  const threatPenalty = ctx.underThreat ? 18 : 0;

  switch (structureType) {
    case "FARMSTEAD":
      return (
        (candidate.resource === "FARM" || candidate.resource === "FISH" ? 110 : -200) +
        (ctx.foodCoverageLow ? 140 : 0) +
        (ctx.openingGrowthPhase ? 18 : 0) -
        threatPenalty
      );
    case "GRANARY":
      return (
        (candidate.isTown ? 82 : 24) +
        (candidate.resource === "FARM" || candidate.resource === "FISH" ? 56 : 0) +
        candidate.supportedTownCount * 18 +
        (ctx.foodCoverageLow ? 150 : 0) +
        (ctx.economyWeak ? 18 : 0) -
        threatPenalty
      );
    case "CAMP":
      return (
        (candidate.resource === "FUR" || candidate.resource === "WOOD" ? 92 : -200) +
        (ctx.economyWeak ? 24 : 0) +
        (ctx.economicVictoryBias ? 16 : 0) -
        threatPenalty
      );
    case "MINE":
      return (
        (candidate.resource === "IRON" || candidate.resource === "GEMS" ? 104 : -200) +
        (ctx.economicVictoryBias ? 22 : 0) +
        (ctx.economyWeak ? 18 : 0) -
        threatPenalty
      );
    case "MARKET":
      return (
        68 +
        townCommercialValue +
        (candidate.resource === "FUR" || candidate.resource === "WOOD" || candidate.resource === "IRON" || candidate.resource === "GEMS" ? 34 : 0) +
        Math.round(dockTradeValue * 0.2) +
        (ctx.economicVictoryBias ? 32 : 0) -
        threatPenalty
      );
    case "BANK":
      return (
        (candidate.isTown ? 118 : -220) +
        townCommercialValue +
        candidate.connectedTownCount * 18 +
        (ctx.economicVictoryBias ? 42 : 0) +
        (ctx.foodCoverageLow ? -90 : 0) +
        (ctx.economyWeak ? -18 : 0) +
        (ctx.openingGrowthPhase ? -34 : 0) -
        threatPenalty
      );
    case "CUSTOMS_HOUSE":
      return (
        (candidate.isDock || candidate.supportedDockCount > 0 || candidate.connectedDockCount > 0 ? 160 : -260) +
        dockTradeValue +
        (ctx.economicVictoryBias ? 48 : 0) +
        (ctx.openingGrowthPhase ? 12 : 0) -
        (ctx.foodCoverageLow ? 16 : 0)
      );
    case "GOVERNORS_OFFICE":
      return (
        (candidate.isTown ? 96 : -220) +
        candidate.connectedTownCount * 34 +
        candidate.supportedTownCount * 28 +
        clamp(candidate.townIncomePerMinute, 0, 16) * 7 +
        (ctx.economicVictoryBias ? 18 : 0) +
        (ctx.foodCoverageLow ? -70 : 0) +
        (ctx.economyWeak ? -14 : 0) +
        (ctx.openingGrowthPhase ? -28 : 0) -
        threatPenalty
      );
    default:
      return Number.NEGATIVE_INFINITY;
  }
};

export const chooseAiEconomicStructurePlan = (
  ctx: AiEconomicStructureContext,
  candidates: AiEconomicStructureCandidate[]
): AiEconomicStructurePlan | undefined => {
  let best: AiEconomicStructurePlan | undefined;
  for (const candidate of candidates) {
    for (const structureType of structureTypesForEconomicCandidate(candidate)) {
      const score = scoreAiEconomicStructureCandidate(ctx, candidate, structureType);
      if (!best || score > best.score) {
        best = {
          tileIndex: candidate.tileIndex,
          structureType,
          score
        };
      }
    }
  }
  return best;
};
