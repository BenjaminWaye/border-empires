export type AiGrowthFoundationContext = {
  controlledTowns: number;
  hasActiveTown: boolean;
  hasActiveDock: boolean;
  aiIncome: number;
};

export const hasAiGrowthFoundation = ({
  controlledTowns,
  hasActiveTown,
  hasActiveDock,
  aiIncome
}: AiGrowthFoundationContext): boolean => controlledTowns > 0 || hasActiveTown || hasActiveDock || aiIncome >= 12;

export type AiScoutExpansionWorthwhileContext = {
  settledTiles: number;
  underThreat: boolean;
  economyWeak: boolean;
  settlementAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityWaste: number;
  hasGrowthFoundation: boolean;
};

export const isAiScoutExpansionWorthwhile = ({
  settledTiles,
  underThreat,
  economyWeak,
  settlementAvailable,
  frontierOpportunityEconomic,
  frontierOpportunityScout,
  frontierOpportunityWaste,
  hasGrowthFoundation
}: AiScoutExpansionWorthwhileContext): boolean => {
  if (frontierOpportunityScout <= 0) return false;
  if (underThreat || economyWeak || settlementAvailable) return false;
  if (settledTiles <= 2) return frontierOpportunityScout >= Math.max(1, Math.ceil(frontierOpportunityWaste / 2));
  if (!hasGrowthFoundation) return false;
  return frontierOpportunityScout > frontierOpportunityWaste && frontierOpportunityScout >= Math.max(2, frontierOpportunityEconomic);
};

export type AiAttackReadinessContext = {
  manpower: number;
  attackManpowerMin: number;
  underThreat: boolean;
  threatCritical: boolean;
  economyWeak: boolean;
  controlledTowns: number;
};

export const requiredAiAttackManpower = ({
  attackManpowerMin,
  underThreat,
  threatCritical,
  economyWeak,
  controlledTowns
}: Omit<AiAttackReadinessContext, "manpower">): number => {
  if (threatCritical) return attackManpowerMin;
  if (underThreat) return attackManpowerMin + 5;
  if (economyWeak || controlledTowns <= 1) return attackManpowerMin + 15;
  return attackManpowerMin + 10;
};

export const isAiAttackReady = (context: AiAttackReadinessContext): boolean =>
  context.manpower >= requiredAiAttackManpower(context);

export type AiIslandFootprintContinuationContext = {
  primaryVictoryPath?: "TOWN_CONTROL" | "SETTLED_TERRITORY" | "ECONOMIC_HEGEMONY";
  growthFoundationEstablished: boolean;
  undercoveredIslandCount: number;
  islandExpandAvailable: boolean;
  islandSettlementAvailable: boolean;
  foodCoverageLow: boolean;
  foodCoverage: number;
  pressureThreatensCore: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
  economyWeak: boolean;
  controlledTowns: number;
  settledTiles: number;
  aiIncome: number;
};

export const shouldAiStayInIslandFootprint = ({
  primaryVictoryPath,
  growthFoundationEstablished,
  undercoveredIslandCount,
  islandExpandAvailable,
  islandSettlementAvailable,
  foodCoverageLow,
  foodCoverage,
  pressureThreatensCore,
  frontierOpportunityEconomic,
  frontierOpportunityScaffold,
  frontierOpportunityWaste,
  economyWeak,
  controlledTowns,
  settledTiles,
  aiIncome
}: AiIslandFootprintContinuationContext): boolean => {
  if (primaryVictoryPath !== "SETTLED_TERRITORY") return false;
  if (!growthFoundationEstablished) return false;
  if (undercoveredIslandCount <= 0) return false;
  if (!islandExpandAvailable && !islandSettlementAvailable) return false;
  if (foodCoverageLow && foodCoverage < 1) return false;
  if (pressureThreatensCore) return false;

  const islandMeaningfulOpportunity =
    islandSettlementAvailable ||
    frontierOpportunityEconomic > 0 ||
    frontierOpportunityScaffold >= 3;
  if (!islandMeaningfulOpportunity) return false;

  const islandWasteDominated =
    frontierOpportunityWaste >
    frontierOpportunityEconomic * 8 + frontierOpportunityScaffold * 10 + 160;
  if (islandWasteDominated) return false;

  if (!economyWeak) return true;
  return controlledTowns >= 2 && settledTiles >= 40 && aiIncome >= 5;
};
