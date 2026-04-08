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
