/** Season-scoped AFC configuration. Manifests pay for tier access; these picks are free. */
export const AFC_SPECIALIZATION_RULESET = "afc-v1" as const;
export type AfcSpecializationRuleset = typeof AFC_SPECIALIZATION_RULESET;
export type AfcSpecializationBranch = "vanguard" | "bastion" | "dominion" | "exchequer" | "oracle" | "chancery";
export type AfcSpecializationTier = 1 | 2 | 3 | 4 | 5;
export interface AfcSpecializationEffects {
  readonly allianceGoldPerDay?: number;
  readonly allianceManpowerCapAdd?: number;
  readonly allianceManpowerRegenPerMinute?: number;
  readonly alliedDockIncomeMult?: number;
  readonly attackResolveSpeedReduceMs?: number;
  readonly attackVsBarbariansMult?: number;
  readonly breakthroughBonusTiles?: number;
  readonly clearingHouseUpliftMult?: number;
  readonly coalitionAttackMult?: number;
  readonly commandSignalIntercept?: number;
  readonly corePopulationConsignmentMult?: number;
  readonly diplomaticTerritoryWeightMult?: number;
  readonly dockReachRadiusBonus?: number;
  readonly factoryDefenseContributionMult?: number;
  readonly firstThreeTownsFoodSlotReduction?: number;
  readonly firstThreeTownsGoldOutputMult?: number;
  readonly flagMomentumAttackPerStack?: number;
  readonly forcedTruceCooldownMs?: number;
  readonly forcedTruceDurationMs?: number;
  readonly fortAttackManpowerCostMult?: number;
  readonly fortAttackerCommitmentMult?: number;
  readonly fortBuildSpeedMult?: number;
  readonly fortTitaniumSlotWaiverCount?: number;
  readonly fortWardRechargeMs?: number;
  readonly fortifiedTownDefenseMult?: number;
  readonly logisticsThroughputMult?: number;
  readonly musterMaxTilesAdd?: number;
  readonly observatoryCooldownMult?: number;
  readonly observatoryCrystalSlotWaiverCount?: number;
  readonly observatoryRangeBonus?: number;
  readonly orbitalRecruitmentMpPerCoin?: number;
  readonly relayBeaconBuildSpeedMult?: number;
  readonly scarcityConsignment?: number;
  readonly settlementSpeedMult?: number;
  readonly structureBuildSpeedMult?: number;
  readonly towerSuppressionDurationMs?: number;
  readonly townReachRadiusBonus?: number;
}
export interface AfcSpecialization {
  readonly id: string;
  readonly tier: AfcSpecializationTier;
  readonly branch: AfcSpecializationBranch;
  readonly name: string;
  readonly description: string;
  readonly mechanicalSummary: string;
  readonly category: "ongoing" | "installation" | "active";
  readonly requiresTechId: "";
  readonly effects: AfcSpecializationEffects;
}
