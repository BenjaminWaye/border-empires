import type { StatsModKey } from "./tech-tree.js";
import type { AiSeasonVictoryPathId } from "./ai/goap.js";

export interface TechRequirementChecklist {
  label: string;
  met: boolean;
}

export interface DomainRequirementChecklist {
  label: string;
  met: boolean;
}

export interface PlayerEffects {
  unlockForts: boolean;
  unlockSiegeOutposts: boolean;
  unlockWoodenFort: boolean;
  unlockLightOutpost: boolean;
  unlockSynthOverload: boolean;
  unlockAdvancedSynthesizers: boolean;
  unlockGranary: boolean;
  unlockRevealRegion: boolean;
  unlockRevealEmpire: boolean;
  unlockDeepStrike: boolean;
  unlockAetherBridge: boolean;
  unlockMountainPass: boolean;
  unlockTerrainShaping: boolean;
  unlockBreachAttack: boolean;
  settlementSpeedMult: number;
  operationalTempoMult: number;
  researchTimeMult: number;
  abilityCooldownMult: number;
  sabotageCooldownMult: number;
  populationGrowthMult: number;
  firstThreeTownsPopulationGrowthMult: number;
  firstThreeTownsGoldOutputMult: number;
  populationCapFirst3TownsMult: number;
  growthPauseDurationMult: number;
  townFoodUpkeepMult: number;
  settledFoodUpkeepMult: number;
  settledGoldUpkeepMult: number;
  townGoldOutputMult: number;
  townGoldCapMult: number;
  marketIncomeBonusAdd: number;
  marketCapBonusAdd: number;
  granaryCapBonusAdd: number;
  populationIncomeMult: number;
  connectedTownStepBonusAdd: number;
  harvestCapMult: number;
  fortBuildGoldCostMult: number;
  fortDefenseMult: number;
  fortIronUpkeepMult: number;
  fortGoldUpkeepMult: number;
  outpostAttackMult: number;
  outpostSupplyUpkeepMult: number;
  outpostGoldUpkeepMult: number;
  revealUpkeepMult: number;
  revealCapacityBonus: number;
  visionRadiusBonus: number;
  observatoryProtectionRadiusBonus: number;
  observatoryCastRadiusBonus: number;
  observatoryVisionBonus: number;
  dockGoldOutputMult: number;
  dockGoldCapMult: number;
  dockConnectionBonusPerLink: number;
  dockRoutesVisible: boolean;
  marketCrystalUpkeepMult: number;
  settledDefenseMult: number;
  settledDefenseNearFortMult: number;
  attackVsSettledMult: number;
  attackVsFortsMult: number;
  newSettlementDefenseMult: number;
  buildCapacityAdd: number;
  developmentProcessCapacityAdd: number;
  frontierDefenseAdd: number;
  resourceOutputMult: { FARM: number; FISH: number; IRON: number; CRYSTAL: number; SUPPLY: number; SHARD: number; OIL: number };
}

export const emptyPlayerEffects = (): PlayerEffects => ({
  unlockForts: false,
  unlockSiegeOutposts: false,
  unlockWoodenFort: true,
  unlockLightOutpost: true,
  unlockSynthOverload: false,
  unlockAdvancedSynthesizers: false,
  unlockGranary: false,
  unlockRevealRegion: false,
  unlockRevealEmpire: false,
  unlockDeepStrike: false,
  unlockAetherBridge: false,
  unlockMountainPass: false,
  unlockTerrainShaping: false,
  unlockBreachAttack: false,
  settlementSpeedMult: 1,
  operationalTempoMult: 1,
  researchTimeMult: 1,
  abilityCooldownMult: 1,
  sabotageCooldownMult: 1,
  populationGrowthMult: 1,
  firstThreeTownsPopulationGrowthMult: 1,
  firstThreeTownsGoldOutputMult: 1,
  populationCapFirst3TownsMult: 1,
  growthPauseDurationMult: 1,
  townFoodUpkeepMult: 1,
  settledFoodUpkeepMult: 1,
  settledGoldUpkeepMult: 1,
  townGoldOutputMult: 1,
  townGoldCapMult: 1,
  marketIncomeBonusAdd: 0.5,
  marketCapBonusAdd: 0.5,
  granaryCapBonusAdd: 0.2,
  populationIncomeMult: 1,
  connectedTownStepBonusAdd: 0,
  harvestCapMult: 1,
  fortBuildGoldCostMult: 1,
  fortDefenseMult: 1,
  fortIronUpkeepMult: 1,
  fortGoldUpkeepMult: 1,
  outpostAttackMult: 1,
  outpostSupplyUpkeepMult: 1,
  outpostGoldUpkeepMult: 1,
  revealUpkeepMult: 1,
  revealCapacityBonus: 0,
  visionRadiusBonus: 0,
  observatoryProtectionRadiusBonus: 0,
  observatoryCastRadiusBonus: 0,
  observatoryVisionBonus: 0,
  dockGoldOutputMult: 1,
  dockGoldCapMult: 1,
  dockConnectionBonusPerLink: 0.5,
  dockRoutesVisible: false,
  marketCrystalUpkeepMult: 1,
  settledDefenseMult: 1,
  settledDefenseNearFortMult: 1,
  attackVsSettledMult: 1,
  attackVsFortsMult: 1,
  newSettlementDefenseMult: 1,
  buildCapacityAdd: 0,
  developmentProcessCapacityAdd: 0,
  frontierDefenseAdd: 0,
  resourceOutputMult: { FARM: 1, FISH: 1, IRON: 1, CRYSTAL: 1, SUPPLY: 1, SHARD: 1, OIL: 1 }
});

export interface TelemetryCounters {
  frontierClaims: number;
  settlements: number;
  breakthroughAttacks: number;
  techUnlocks: number;
}

export type StatsModBreakdownEntry = { label: string; mult: number };
export type StatsModBreakdown = Record<StatsModKey, StatsModBreakdownEntry[]>;

export type AiTurnDebugEntry = {
  at: number;
  playerId: string;
  name: string;
  reason: string;
  points: number;
  incomePerMinute?: number;
  controlledTowns?: number;
  settledTiles?: number;
  primaryVictoryPath?: AiSeasonVictoryPathId;
  goapGoalId?: string;
  goapActionKey?: string;
  executed?: boolean;
  details?: Record<string, boolean | number | string | undefined>;
};

export type AiActionFailureEntry = {
  at: number;
  actionKey: string;
  code: string;
  reason: string;
  x?: number;
  y?: number;
};
