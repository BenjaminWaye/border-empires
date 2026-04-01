import { AI_EMPIRE_ACTIONS, goalsForVictoryPath, planBestGoal, type AiSeasonVictoryPathId } from "./goap.js";

export type AiPlanningSnapshot = {
  primaryVictoryPath: AiSeasonVictoryPathId | undefined;
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
  hasActiveTown: boolean;
  hasActiveDock: boolean;
  points: number;
  stamina: number;
  openingScoutAvailable: boolean;
  neutralExpandAvailable: boolean;
  scoutExpandAvailable: boolean;
  scaffoldExpandAvailable: boolean;
  barbarianAttackAvailable: boolean;
  enemyAttackAvailable: boolean;
  pressureAttackAvailable: boolean;
  pressureAttackScore: number;
  settlementAvailable: boolean;
  fortAvailable: boolean;
  fortProtectsCore: boolean;
  fortIsDockChokePoint: boolean;
  economicBuildAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
  canAffordFrontierAction: boolean;
  canAffordSettlement: boolean;
  canBuildFort: boolean;
  canBuildEconomy: boolean;
  goldHealthy: boolean;
};

export type AiPlanningDecision = {
  reason: string;
  actionKey?: string;
  goapGoalId?: string;
  goapActionKey?: string;
};

export const planAiDecision = (snapshot: AiPlanningSnapshot): AiPlanningDecision => {
  const urgentPressureAttackReady =
    snapshot.pressureAttackAvailable &&
    snapshot.canAffordFrontierAction &&
    ((snapshot.pressureAttackScore >= 350) || (snapshot.underThreat && snapshot.pressureAttackScore >= 220));
  const pressureAttackReady =
    snapshot.pressureAttackAvailable &&
    snapshot.canAffordFrontierAction &&
    (!snapshot.threatCritical || urgentPressureAttackReady);
  const economicPushReady = snapshot.frontierOpportunityEconomic > 0 && snapshot.neutralExpandAvailable;
  const needsFortifiedAnchor =
    snapshot.fortAvailable &&
    snapshot.fortProtectsCore &&
    (snapshot.controlledTowns > 0 || snapshot.hasActiveDock || snapshot.aiIncome >= 16);
  const fortifyChokePoint =
    snapshot.fortAvailable &&
    snapshot.fortProtectsCore &&
    !pressureAttackReady &&
    !urgentPressureAttackReady &&
    (
      (snapshot.underThreat && snapshot.threatCritical && !snapshot.settlementAvailable) ||
      (snapshot.fortIsDockChokePoint &&
        snapshot.hasActiveDock &&
        !snapshot.economyWeak &&
        !snapshot.foodCoverageLow &&
        !snapshot.settlementAvailable)
    );

  if (urgentPressureAttackReady) {
    return { reason: "executed_pressure_counterattack_priority", actionKey: "attack_enemy_border_tile", goapActionKey: "attack_enemy_border_tile" };
  }
  if (snapshot.foodCoverageLow && snapshot.settlementAvailable && snapshot.canAffordSettlement) {
    return { reason: "executed_food_settlement_priority", actionKey: "settle_owned_frontier_tile", goapActionKey: "settle_owned_frontier_tile" };
  }
  if (snapshot.foodCoverageLow && economicPushReady && snapshot.canAffordFrontierAction) {
    return { reason: "executed_food_expand_priority", actionKey: "claim_food_border_tile", goapActionKey: "claim_food_border_tile" };
  }
  if ((snapshot.economyWeak || snapshot.foodCoverageLow || snapshot.controlledTowns > 0 || snapshot.hasActiveDock) && snapshot.settlementAvailable && snapshot.canAffordSettlement) {
    return { reason: "executed_settlement_priority", actionKey: "settle_owned_frontier_tile", goapActionKey: "settle_owned_frontier_tile" };
  }
  if (pressureAttackReady && (snapshot.primaryVictoryPath === "TOWN_CONTROL" || snapshot.pressureAttackScore >= 150)) {
    return { reason: "executed_pressure_attack_priority", actionKey: "attack_enemy_border_tile", goapActionKey: "attack_enemy_border_tile" };
  }
  if (snapshot.economyWeak && economicPushReady && snapshot.canAffordFrontierAction) {
    return { reason: "executed_economic_expand_priority", actionKey: "claim_neutral_border_tile", goapActionKey: "claim_neutral_border_tile" };
  }
  if (snapshot.economyWeak && snapshot.economicBuildAvailable && !snapshot.underThreat) {
    return { reason: "executed_economic_priority", actionKey: "build_economic_structure", goapActionKey: "build_economic_structure" };
  }
  if (fortifyChokePoint && snapshot.points >= 45) {
    return { reason: "executed_fort_priority", actionKey: "build_fort_on_exposed_tile", goapActionKey: "build_fort_on_exposed_tile" };
  }

  const goapState = {
    hasNeutralLandOpportunity: snapshot.neutralExpandAvailable,
    hasScoutOpportunity: snapshot.scoutExpandAvailable,
    hasScaffoldOpportunity: snapshot.scaffoldExpandAvailable,
    hasBarbarianTarget: snapshot.barbarianAttackAvailable,
    hasWeakEnemyBorder: snapshot.pressureAttackAvailable || snapshot.enemyAttackAvailable,
    needsSettlement: snapshot.settlementAvailable,
    frontierDebtHigh: snapshot.frontierDebt,
    foodCoverageLow: snapshot.foodCoverageLow,
    underThreat: snapshot.underThreat,
    threatCritical: snapshot.threatCritical,
    economyWeak: snapshot.economyWeak,
    needsFortifiedAnchor,
    canAffordFrontierAction: snapshot.canAffordFrontierAction,
    canAffordSettlement: snapshot.canAffordSettlement,
    canBuildFort: snapshot.canBuildFort,
    canBuildEconomy: snapshot.canBuildEconomy,
    goldHealthy: snapshot.goldHealthy,
    staminaHealthy: snapshot.stamina >= 0
  };

  const goapPlan = planBestGoal(goapState, goalsForVictoryPath(snapshot.primaryVictoryPath), AI_EMPIRE_ACTIONS);
  const nextStep = goapPlan?.steps[0];
  if (!nextStep) {
    if (snapshot.economicBuildAvailable && snapshot.canBuildEconomy && (!snapshot.underThreat || !snapshot.threatCritical)) {
      return { reason: "executed_economic_recovery_fallback", actionKey: "build_economic_structure", goapActionKey: "build_economic_structure" };
    }
    if (snapshot.settlementAvailable && snapshot.canAffordSettlement) {
      return { reason: "executed_settlement_fallback", actionKey: "settle_owned_frontier_tile", goapActionKey: "settle_owned_frontier_tile" };
    }
    if (snapshot.openingScoutAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_opening_scout", actionKey: "opening_scout_expand", goapActionKey: "claim_neutral_border_tile" };
    }
    if (pressureAttackReady) {
      return { reason: "executed_pressure_attack_fallback", actionKey: "attack_enemy_border_tile", goapActionKey: "attack_enemy_border_tile" };
    }
    if (!economicPushReady && snapshot.scoutExpandAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_scout_fallback", actionKey: "claim_scout_border_tile", goapActionKey: "claim_scout_border_tile" };
    }
    if (!economicPushReady && snapshot.scaffoldExpandAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_scaffold_fallback", actionKey: "claim_scaffold_border_tile", goapActionKey: "claim_scaffold_border_tile" };
    }
    if (snapshot.economyWeak && snapshot.neutralExpandAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_expand_fallback", actionKey: "claim_neutral_border_tile", goapActionKey: "claim_neutral_border_tile" };
    }
    if (snapshot.frontierOpportunityWaste > 0 && snapshot.scoutExpandAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_visibility_expand_fallback", actionKey: "claim_scout_border_tile", goapActionKey: "claim_scout_border_tile" };
    }
    if (snapshot.frontierOpportunityWaste > 0 && snapshot.neutralExpandAvailable && snapshot.canAffordFrontierAction) {
      return { reason: "executed_neutral_expand_fallback", actionKey: "claim_neutral_border_tile", goapActionKey: "claim_neutral_border_tile" };
    }
    return { reason: "no_goap_step" };
  }

  return {
    reason: "executed_goap_action",
    actionKey: nextStep.action.key,
    goapGoalId: goapPlan?.goalId,
    goapActionKey: nextStep.action.key
  };
};
