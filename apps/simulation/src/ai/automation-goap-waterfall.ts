/**
 * GOAP decision waterfall — scheduled for deletion in Phase 4 when the utility
 * AI policy becomes the default.
 *
 * Extracted from automation-command-planner.ts to keep that file under the
 * 500-line project limit.  Only automation-command-planner.ts calls this module.
 */

import type { AutomationStrategicSnapshot, AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import type { FrontierAnalysis } from "./frontier-command-planner.js";
import { chooseAutomationGoapDecision, type AiSeasonVictoryPathId } from "./automation-goap.js";
import {
  buildPlannerCommand,
  buildPlannerFrontierCommand,
  buildPlannerSettleCommand,
  hasActionableSettlementCandidate,
  type AutomationPlannerDecisionContext
} from "./automation-command-planner-helpers.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";
import {
  goapGoldReserveHealthy,
  type AutomationNoopReason,
  type AutomationPlannerPhase,
  type AutomationPlannerResult,
  type AutomationPlannerTile
} from "./automation-command-planner-types.js";

// ── GOAP victory-path mapping ────────────────────────────────────────────────
// The strategic snapshot classifies five victory paths but GOAP goal trees are
// still defined for the original three. Map the new paths onto the closest
// legacy goal tree until path-specific goals are added.
export const mapVictoryPathForGoap = (
  path: AutomationStrategicSnapshot["primaryVictoryPath"]
): AiSeasonVictoryPathId => {
  switch (path) {
    case "RESOURCE_MONOPOLY":
      return "ECONOMIC_HEGEMONY";
    case "MARITIME_SUPREMACY":
      return "DIPLOMATIC_DOMINANCE";
    default:
      return path;
  }
};

// ── GOAP fallback ────────────────────────────────────────────────────────────

const buildGoapFallbackResult = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  frontierAnalysis: FrontierAnalysis,
  points: number,
  strategic: AutomationStrategicSnapshot,
  canAttack: boolean,
  canExpand: boolean,
  actionableFallbackSettlementCandidate: TTile | undefined,
  economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined,
  fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined,
  siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined,
  attackStalemateTargetTileKeys: ReadonlySet<string> | undefined
): AutomationPlannerResult | undefined => {
  const isStalemated = (selection: FrontierAnalysis["attack"] | undefined): boolean =>
    Boolean(selection && attackStalemateTargetTileKeys?.has(`${selection.target.x},${selection.target.y}`));
  const hasBarbarianAttackTarget =
    frontierAnalysis.frontierBarbarianTargetCount > 0 && !isStalemated(frontierAnalysis.barbarianAttack);
  const hasWeakEnemyBorder =
    frontierAnalysis.frontierEnemyPlayerTargetCount > 0 && !isStalemated(frontierAnalysis.enemyAttack);
  const goapDecision = chooseAutomationGoapDecision({
    hasNeutralLandOpportunity: Boolean(frontierAnalysis.economicExpand && frontierAnalysis.frontierOpportunityEconomic > 0),
    hasScoutOpportunity: Boolean(frontierAnalysis.scoutExpand),
    hasScaffoldOpportunity: Boolean(frontierAnalysis.scaffoldExpand),
    hasBarbarianTarget: hasBarbarianAttackTarget,
    hasWeakEnemyBorder,
    hasSiegeOutpostSite: Boolean(siegeOutpostBuild && frontierAnalysis.enemyAttack),
    attackReady: strategic.attackReady,
    musterReady: strategic.musterReady,
    needsSettlement: Boolean(actionableFallbackSettlementCandidate),
    frontierDebtHigh: frontierAnalysis.frontierNeutralTargetCount >= 3,
    foodCoverageLow: context.needsFood,
    underThreat: strategic.underThreat,
    threatCritical: strategic.threatCritical,
    economyWeak: context.needsEconomy,
    needsFortifiedAnchor: Boolean(fortBuild) && frontierAnalysis.frontierEnemyTargetCount > 0,
    canAffordFrontierAction: canExpand,
    canAffordSettlement: Boolean(actionableFallbackSettlementCandidate),
    canBuildFort: Boolean(fortBuild),
    canBuildEconomy: Boolean(economicBuild),
    canBuildSiegeOutpost: Boolean(siegeOutpostBuild),
    goldHealthy: goapGoldReserveHealthy(points),
    staminaHealthy: strategic.manpowerSufficient || !strategic.underThreat
  }, mapVictoryPathForGoap(strategic.primaryVictoryPath));
  if (!goapDecision) return undefined;

  switch (goapDecision.actionKey) {
    case "claim_food_border_tile":
      if (frontierAnalysis.economicExpand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
      if (frontierAnalysis.expand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
      return undefined;
    case "claim_neutral_border_tile":
      if (frontierAnalysis.economicExpand && canExpand && frontierAnalysis.frontierOpportunityEconomic > 0) {
        return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
      }
      if (frontierAnalysis.expand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
      return undefined;
    case "claim_scout_border_tile":
      return frontierAnalysis.scoutExpand && canExpand
        ? buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND")
        : undefined;
    case "claim_scaffold_border_tile":
      return frontierAnalysis.scaffoldExpand && canExpand
        ? buildPlannerFrontierCommand(context, frontierAnalysis.scaffoldExpand, "EXPAND")
        : undefined;
    case "attack_barbarian_border_tile":
      return frontierAnalysis.barbarianAttack && canAttack && strategic.attackReady && hasBarbarianAttackTarget
        ? buildPlannerFrontierCommand(context, frontierAnalysis.barbarianAttack, "ATTACK")
        : undefined;
    case "attack_enemy_border_tile":
      return frontierAnalysis.enemyAttack && canAttack && strategic.attackReady && !strategic.musterReady && hasWeakEnemyBorder
        ? buildPlannerFrontierCommand(context, frontierAnalysis.enemyAttack, "ATTACK")
        : undefined;
    case "place_muster":
      return frontierAnalysis.enemyAttack && strategic.musterReady && hasWeakEnemyBorder
        ? buildPlannerCommand(context, "SET_MUSTER", {
            x: frontierAnalysis.enemyAttack.from.x,
            y: frontierAnalysis.enemyAttack.from.y,
            mode: "ADVANCE"
          })
        : undefined;
    case "build_siege_outpost":
      return siegeOutpostBuild
        ? buildPlannerCommand(context, "BUILD_SIEGE_OUTPOST", { x: siegeOutpostBuild.x, y: siegeOutpostBuild.y })
        : undefined;
    case "settle_owned_frontier_tile":
      return actionableFallbackSettlementCandidate
        ? buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate)
        : undefined;
    case "build_fort_on_exposed_tile":
      return fortBuild ? buildPlannerCommand(context, "BUILD_FORT", { x: fortBuild.x, y: fortBuild.y }) : undefined;
    case "build_economic_structure":
      return economicBuild
        ? buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
            x: economicBuild.tile.x,
            y: economicBuild.tile.y,
            structureType: economicBuild.structureType
          })
        : undefined;
    case "wait_and_recover":
      if (
        frontierAnalysis.economicExpand ||
        frontierAnalysis.scaffoldExpand ||
        frontierAnalysis.attack ||
        !frontierAnalysis.scoutExpand
      ) {
        return undefined;
      }
      return { diagnostic: { ...context.diagnostic, noCommandReason: "wait_and_recover" } };
    default:
      return undefined;
  }
};

// ── Waterfall state ───────────────────────────────────────────────────────────

export type GoapWaterfallState<TTile extends AutomationPlannerTile> = {
  context: AutomationPlannerDecisionContext<TTile>;
  strategic: AutomationStrategicSnapshot;
  frontierAnalysis: FrontierAnalysis;
  preferredEnemyAttack: FrontierAnalysis["attack"] | undefined;
  canSettleNow: boolean;
  settlementCandidate: TTile | undefined;
  actionableFallbackSettlementCandidate: TTile | undefined;
  canAttack: boolean;
  canExpand: boolean;
  needsFood: boolean;
  needsEconomy: boolean;
  techUnaffordable: boolean;
  effectiveDevelopmentProcessCount: number;
  settlementEligible: boolean;
  fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined;
  siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined;
  economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined;
  attackStalemateTargetTileKeys: ReadonlySet<string> | undefined;
  expansionObjective: { x: number; y: number; kind: "neutral_value" | "enemy" } | undefined;
  points: number;
  summarizeStartedAt: number;
  recordPhaseTiming: (phase: AutomationPlannerPhase, startedAt: number) => void;
};

// ── Main waterfall ────────────────────────────────────────────────────────────

export const runGoapWaterfall = <TTile extends AutomationPlannerTile>(
  state: GoapWaterfallState<TTile>
): AutomationPlannerResult => {
  const {
    context, strategic, frontierAnalysis, preferredEnemyAttack,
    canSettleNow, settlementCandidate, actionableFallbackSettlementCandidate,
    canAttack, canExpand, needsFood, needsEconomy, techUnaffordable,
    effectiveDevelopmentProcessCount, settlementEligible,
    fortBuild, siegeOutpostBuild, economicBuild,
    points, summarizeStartedAt, recordPhaseTiming
  } = state;

  const isStalematedAttackTarget = (selection: typeof preferredEnemyAttack): boolean =>
    Boolean(
      selection &&
      state.attackStalemateTargetTileKeys?.has(`${selection.target.x},${selection.target.y}`)
    );

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    strategic.attackReady &&
    !strategic.musterReady &&
    strategic.frontPosture === "BREAK" &&
    strategic.pressureThreatensCore &&
    strategic.pressureAttackScore >= 220
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (settlementCandidate && canSettleNow) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, settlementCandidate as TTile);
  }

  if (frontierAnalysis.economicExpand && canExpand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
  }

  if (frontierAnalysis.directedExpand && canExpand) {
    context.diagnostic.expansionObjectiveKind = state.expansionObjective?.kind ?? "none";
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.directedExpand, "EXPAND");
  }

  if (strategic.townSupportSettlementAvailable && actionableFallbackSettlementCandidate && !strategic.pressureThreatensCore) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    strategic.townSupportExpandAvailable &&
    frontierAnalysis.townSupportExpand &&
    canExpand &&
    !strategic.pressureThreatensCore &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.townSupportExpand, "EXPAND");
  }
  if (
    frontierAnalysis.attack &&
    strategic.attackReady &&
    !strategic.musterReady &&
    strategic.frontPosture === "BREAK" &&
    (
      strategic.primaryVictoryPath === "TOWN_CONTROL" ||
      strategic.primaryVictoryPath === "ECONOMIC_HEGEMONY" ||
      strategic.victoryPathContender ||
      strategic.pressureAttackScore >= 200
    ) &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (
    frontierAnalysis.economicExpand &&
    canExpand &&
    !actionableFallbackSettlementCandidate &&
    (
      needsFood ||
      needsEconomy ||
      (!settlementCandidate && frontierAnalysis.frontierOpportunityEconomic > 0)
    )
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
  }

  if (strategic.islandSettlementAvailable && actionableFallbackSettlementCandidate && !strategic.pressureThreatensCore) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    strategic.islandExpandAvailable &&
    canExpand &&
    !canSettleNow &&
    !actionableFallbackSettlementCandidate &&
    frontierAnalysis.expand
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
  }

  if (
    techUnaffordable &&
    frontierAnalysis.scoutExpand &&
    canExpand &&
    !canSettleNow &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (actionableFallbackSettlementCandidate) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }

  const goapFallbackResult = buildGoapFallbackResult(
    context,
    frontierAnalysis,
    points,
    strategic,
    canAttack,
    canExpand,
    actionableFallbackSettlementCandidate,
    economicBuild,
    fortBuild,
    siegeOutpostBuild,
    state.attackStalemateTargetTileKeys
  );
  if (goapFallbackResult) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return goapFallbackResult;
  }

  if (
    siegeOutpostBuild &&
    preferredEnemyAttack &&
    strategic.frontPosture !== "TRUCE" &&
    !strategic.underThreat &&
    (strategic.primaryVictoryPath === "TOWN_CONTROL" || strategic.primaryVictoryPath === "ECONOMIC_HEGEMONY") &&
    (strategic.victoryPathContender || strategic.pressureAttackScore >= 180) &&
    !hasActionableSettlementCandidate(context)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_SIEGE_OUTPOST", {
      x: siegeOutpostBuild.x,
      y: siegeOutpostBuild.y
    });
  }

  if (
    fortBuild &&
    strategic.frontPosture === "CONTAIN" &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    !hasActionableSettlementCandidate(context)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_FORT", {
      x: fortBuild.x,
      y: fortBuild.y
    });
  }

  if (
    fortBuild &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    frontierAnalysis.frontierNeutralTargetCount === 0 &&
    !settlementCandidate &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_FORT", {
      x: fortBuild.x,
      y: fortBuild.y
    });
  }

  if (
    frontierAnalysis.scaffoldExpand &&
    canExpand &&
    (!state.context.fallbackSettlementCandidate || frontierAnalysis.frontierOpportunityScaffold > 0)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scaffoldExpand, "EXPAND");
  }

  if (strategic.openingScoutAvailable && frontierAnalysis.scoutExpand && canExpand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (
    frontierAnalysis.scoutExpand &&
    canExpand &&
    strategic.scoutExpandWorthwhile
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    strategic.attackReady &&
    !strategic.musterReady &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    (frontierAnalysis.frontierNeutralTargetCount === 0 ||
      (!needsFood && !needsEconomy && !settlementCandidate && frontierAnalysis.frontierEnemyTargetCount > 1))
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    !strategic.musterReady &&
    !(
      strategic.frontPosture === "CONTAIN" &&
      frontierAnalysis.frontierNeutralTargetCount > 0 &&
      (frontierAnalysis.expand || frontierAnalysis.economicExpand)
    )
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (economicBuild) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
      x: economicBuild.tile.x,
      y: economicBuild.tile.y,
      structureType: economicBuild.structureType
    });
  }

  let noCommandReason: AutomationNoopReason;
  const hasAnyFrontierOpportunity =
    frontierAnalysis.frontierEnemyTargetCount > 0 || frontierAnalysis.frontierNeutralTargetCount > 0;
  const hasAnyActionableSettlementCandidate = hasActionableSettlementCandidate(context);
  if (effectiveDevelopmentProcessCount >= DEVELOPMENT_PROCESS_LIMIT && frontierAnalysis.frontierEnemyTargetCount === 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "development_process_limit";
  } else if (!canExpand) {
    noCommandReason = "insufficient_points";
  } else if (!canAttack && frontierAnalysis.frontierEnemyTargetCount > 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "insufficient_manpower_for_attack";
  } else if (!hasAnyFrontierOpportunity && !hasAnyActionableSettlementCandidate) {
    noCommandReason = "no_frontier_targets";
  } else if (settlementEligible) {
    noCommandReason = "no_settlement_target";
  } else if (frontierAnalysis.frontierNeutralTargetCount > 0 && !state.expansionObjective && !frontierAnalysis.economicExpand) {
    noCommandReason = "no_objective_idle";
  } else {
    noCommandReason = "no_frontier_targets";
  }
  recordPhaseTiming("summarize_frontier", summarizeStartedAt);

  return {
    diagnostic: {
      ...context.diagnostic,
      noCommandReason
    }
  };
};
