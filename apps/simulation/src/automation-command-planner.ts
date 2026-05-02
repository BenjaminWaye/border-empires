import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  type EconomicStructureType
,
  type Terrain
} from "@border-empires/shared";

import { chooseBestSettlementTile, chooseBestStrategicSettlementTile } from "./ai-settlement-priority.js";
import { analyzeOwnedFrontierTargetsFromLookup } from "./frontier-command-planner.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";
import { economyWeak, foodCoverageLow, hasCollectibleVisibleYieldSource } from "./ai-economic-heuristics.js";
import { buildAutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";
import type { AutomationStrategicSnapshot, AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import {
  buildPlannerCommand,
  buildPlannerFrontierCommand,
  buildPlannerSettleCommand,
  hasActionableSettlementCandidate,
  shouldSettleCandidateNow,
  type AutomationPlannerDecisionContext
} from "./automation-command-planner-helpers.js";

type StrategicResourceKey = DomainStrategicResourceKey;

export const AUTOMATION_NOOP_REASONS = [
  "player_missing",
  "planner_error",
  "active_lock",
  "development_process_limit",
  "insufficient_points",
  "insufficient_manpower_for_attack",
  "no_settlement_target",
  "no_frontier_targets"
] as const;

export const AUTOMATION_PREPLAN_REASONS = [
  "collect_for_active_lock",
  "collect_for_unaffordable_progression",
  "collect_for_economic_recovery",
  "choose_tech",
  "choose_domain",
  "defer_no_reachable_progression",
  "defer_unaffordable_progression_without_collect",
  "defer_to_main_planner"
] as const;

export const AUTOMATION_PREPLAN_PROGRESS_STATES = [
  "no_reachable_progression",
  "tech_unaffordable",
  "domain_unaffordable",
  "tech_and_domain_unaffordable",
  "tech_affordable",
  "domain_affordable",
  "tech_and_domain_affordable"
] as const;

export type AutomationNoopReason = (typeof AUTOMATION_NOOP_REASONS)[number];
export type AutomationPreplanReason = (typeof AUTOMATION_PREPLAN_REASONS)[number];
export type AutomationPreplanProgressState = (typeof AUTOMATION_PREPLAN_PROGRESS_STATES)[number];
export type AutomationSessionPrefix = "ai-runtime" | "system-runtime";

export type AutomationPlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | undefined;
  resource?: DomainTileState["resource"] | undefined;
  dockId?: string | undefined;
  town?: {
    supportMax?: number | undefined;
    supportCurrent?: number | undefined;
    type?: "MARKET" | "FARMING";
    name?: string;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  } | null | undefined;
  fort?: { ownerId?: string; status?: string } | null | undefined;
  observatory?: { ownerId?: string; status?: string } | null | undefined;
  siegeOutpost?: { ownerId?: string; status?: string } | null | undefined;
  economicStructure?: { ownerId?: string; type?: EconomicStructureType; status?: string } | null | undefined;
};

export type AutomationPlannerDiagnostic = {
  playerId: string;
  sessionPrefix: AutomationSessionPrefix;
  settlementEligible: boolean;
  settlementCandidateFound: boolean;
  frontierEnemyTargetCount: number;
  frontierNeutralTargetCount: number;
  canAttack: boolean;
  canExpand: boolean;
  preplanReason?: AutomationPreplanReason;
  preplanHasCollectibleVisibleYieldSource?: boolean;
  preplanNeedsEconomy?: boolean;
  preplanNeedsFood?: boolean;
  preplanTechChoiceAffordable?: boolean;
  preplanDomainChoiceAffordable?: boolean;
  preplanProgressState?: AutomationPreplanProgressState;
  noCommandReason?: AutomationNoopReason;
};

export type AutomationPlannerPhase = "choose_settlement" | "choose_frontier" | "summarize_frontier";

type AutomationPlannerInput<TTile extends AutomationPlannerTile> = {
  playerId: string;
  points: number;
  manpower: number;
  techIds?: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  hasActiveLock: boolean;
  activeDevelopmentProcessCount: number;
  frontierTiles: readonly TTile[];
  hotFrontierTiles?: readonly TTile[];
  strategicFrontierTiles?: readonly TTile[];
  buildCandidateTiles?: readonly TTile[];
  ownedTiles: readonly TTile[];
  tilesByKey: ReadonlyMap<string, TTile>;
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>;
  isPendingSettlement?: (tile: TTile) => boolean;
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
  onPhaseTiming?: (sample: {
    phase: AutomationPlannerPhase;
    durationMs: number;
  }) => void;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  onStrategicSnapshot?: (snapshot: AutomationStrategicSnapshot) => void;
};

export type AutomationPlannerResult = {
  command?: CommandEnvelope;
  diagnostic: AutomationPlannerDiagnostic;
};
export const createAutomationNoopDiagnostic = (
  playerId: string,
  sessionPrefix: AutomationSessionPrefix,
  noCommandReason: AutomationNoopReason
): AutomationPlannerDiagnostic => ({
  playerId,
  sessionPrefix,
  settlementEligible: false,
  settlementCandidateFound: false,
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false,
  noCommandReason
});
export const planAutomationCommand = <TTile extends AutomationPlannerTile>(
  input: AutomationPlannerInput<TTile>
): AutomationPlannerResult => {
  const recordPhaseTiming = (phase: AutomationPlannerPhase, startedAt: number): void => {
    input.onPhaseTiming?.({
      phase,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  };
  if (input.hasActiveLock) {
    return {
      diagnostic: createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "active_lock")
    };
  }

  const settlementEligible =
    input.sessionPrefix === "ai-runtime" &&
    input.activeDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT &&
    input.points >= SETTLE_COST;
  const settlementStartedAt = Date.now();
  const settlementSources = (input.strategicFrontierTiles?.length
    ? input.strategicFrontierTiles
    : input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.frontierTiles) as unknown as Iterable<DomainTileState>;
  const settlementCandidate = settlementEligible
    ? chooseBestStrategicSettlementTile(
        input.playerId,
        settlementSources,
        input.tilesByKey as ReadonlyMap<string, DomainTileState>,
        input.isPendingSettlement
          ? (tile) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false
          : undefined
      )
    : undefined;
  const fallbackSettlementCandidate = settlementEligible
    ? chooseBestSettlementTile(input.playerId, settlementSources, input.tilesByKey as ReadonlyMap<string, DomainTileState>, {
        ...(input.isPendingSettlement
          ? { isPending: (tile: DomainTileState) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false }
          : {})
      })
    : undefined;
  recordPhaseTiming("choose_settlement", settlementStartedAt);

  const canAttack = input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = input.points >= FRONTIER_CLAIM_COST;
  const baseFrontierOrigins =
    (input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.strategicFrontierTiles?.length
        ? input.strategicFrontierTiles
        : input.frontierTiles.length > 0
          ? input.frontierTiles
          : input.ownedTiles) as readonly TTile[];
  const dockOrigins = input.ownedTiles.filter(
    (tile) =>
      Boolean(tile.dockId) &&
      !baseFrontierOrigins.some((candidate) => candidate.x === tile.x && candidate.y === tile.y)
  );
  const frontierOrigins =
    dockOrigins.length > 0
      ? ([...baseFrontierOrigins, ...dockOrigins] as readonly TTile[])
      : baseFrontierOrigins;
  const frontierStartedAt = Date.now();
  const frontierAnalysis =
    canAttack || canExpand
      ? analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey, frontierOrigins, input.playerId, {
          canAttack,
          canExpand,
          ...(input.dockLinksByDockTileKey ? { dockLinksByDockTileKey: input.dockLinksByDockTileKey } : {})
        })
      : {
          frontierEnemyTargetCount: 0,
          frontierNeutralTargetCount: 0,
          frontierOpportunityEconomic: 0,
          frontierOpportunityScout: 0,
          frontierOpportunityScaffold: 0,
          frontierOpportunityWaste: 0
        };
  recordPhaseTiming("choose_frontier", frontierStartedAt);

  const diagnosticBase: AutomationPlannerDiagnostic = {
    playerId: input.playerId,
    sessionPrefix: input.sessionPrefix,
    settlementEligible,
    settlementCandidateFound: Boolean(settlementCandidate),
    frontierEnemyTargetCount: frontierAnalysis.frontierEnemyTargetCount,
    frontierNeutralTargetCount: frontierAnalysis.frontierNeutralTargetCount,
    canAttack,
    canExpand
  };

  const settledTileCount = input.settledTileCount ?? input.ownedTiles.filter((tile) => tile.ownershipState === "SETTLED").length;
  const townCount = input.townCount ?? input.ownedTiles.filter((tile) => tile.town && tile.ownershipState === "SETTLED").length;
  const incomePerMinute = input.incomePerMinute ?? 0;
  const needsFood = foodCoverageLow(input.strategicResources, townCount);
  const needsEconomy = economyWeak(incomePerMinute, settledTileCount);
  const context: AutomationPlannerDecisionContext<TTile> = {
    playerId: input.playerId,
    clientSeq: input.clientSeq,
    issuedAt: input.issuedAt,
    sessionPrefix: input.sessionPrefix,
    diagnostic: diagnosticBase,
    settlementCandidate: settlementCandidate as TTile | undefined,
    fallbackSettlementCandidate: fallbackSettlementCandidate as TTile | undefined,
    frontierAnalysis,
    tilesByKey: input.tilesByKey,
    needsFood,
    needsEconomy
  };
  const summarizeStartedAt = Date.now();
  const actionableFallbackSettlementCandidate =
    fallbackSettlementCandidate && shouldSettleCandidateNow(context, fallbackSettlementCandidate as TTile)
      ? (fallbackSettlementCandidate as TTile)
      : undefined;
  const canSettleNow = Boolean(
    settlementCandidate && shouldSettleCandidateNow(context, settlementCandidate as TTile)
  );

  let economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined;
  let fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined;
  let siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined;
  if (input.sessionPrefix === "ai-runtime" && input.activeDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT) {
    const structurePlayer = {
      id: input.playerId,
      points: input.points,
      ...(input.techIds ? { techIds: input.techIds } : {}),
      ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
      settledTileCount,
      townCount,
      incomePerMinute
    };
    const buildTiles = input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles;
    economicBuild = chooseBestEconomicBuild(structurePlayer, buildTiles, input.tilesByKey);
    fortBuild = chooseBestFortBuild(structurePlayer, buildTiles, input.tilesByKey);
    siegeOutpostBuild = chooseBestSiegeOutpostBuild(structurePlayer, buildTiles, input.tilesByKey);
  }
  const strategic = buildAutomationStrategicSnapshot({
    playerId: input.playerId,
    points: input.points,
    manpower: input.manpower,
    settledTileCount,
    townCount,
    incomePerMinute,
    ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
    ownedTiles: input.ownedTiles,
    tilesByKey: input.tilesByKey,
    frontierAnalysis,
    ...(settlementCandidate ? { settlementCandidate: settlementCandidate as TTile } : {}),
    ...(fallbackSettlementCandidate ? { fallbackSettlementCandidate: fallbackSettlementCandidate as TTile } : {}),
    needsFood,
    needsEconomy,
    canAttack,
    canExpand,
    economicBuildAvailable: Boolean(economicBuild),
    fortBuildAvailable: Boolean(fortBuild),
    siegeOutpostBuildAvailable: Boolean(siegeOutpostBuild),
    ...(input.previousVictoryPath ? { previousVictoryPath: input.previousVictoryPath } : {}),
    ...(input.pathPopulationCounts ? { pathPopulationCounts: input.pathPopulationCounts } : {})
  });
  input.onStrategicSnapshot?.(strategic);

  if (
    frontierAnalysis.attack &&
    strategic.attackReady &&
    strategic.frontPosture === "BREAK" &&
    strategic.pressureThreatensCore &&
    strategic.pressureAttackScore >= 220
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (settlementCandidate && canSettleNow) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, settlementCandidate as TTile);
  }
  if (economicBuild) {
    if (needsFood && !strategic.pressureThreatensCore) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
        x: economicBuild.tile.x,
        y: economicBuild.tile.y,
        structureType: economicBuild.structureType
      });
    }
    if (
      strategic.primaryVictoryPath === "ECONOMIC_HEGEMONY" &&
      !strategic.pressureThreatensCore &&
      (!canSettleNow || incomePerMinute >= 12 || strategic.victoryPathContender)
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
        x: economicBuild.tile.x,
        y: economicBuild.tile.y,
        structureType: economicBuild.structureType
      });
    }
    if (!hasActionableSettlementCandidate(context) && (needsEconomy || frontierAnalysis.frontierOpportunityEconomic > 0 || !settlementCandidate)) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
        x: economicBuild.tile.x,
        y: economicBuild.tile.y,
        structureType: economicBuild.structureType
      });
    }
  }

  if (strategic.townSupportSettlementAvailable && actionableFallbackSettlementCandidate && !strategic.pressureThreatensCore) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    frontierAnalysis.attack &&
    strategic.attackReady &&
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

  if (actionableFallbackSettlementCandidate) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    siegeOutpostBuild &&
    frontierAnalysis.attack &&
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
    (!fallbackSettlementCandidate || frontierAnalysis.frontierOpportunityScaffold > 0)
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
    frontierAnalysis.attack &&
    strategic.attackReady &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    (frontierAnalysis.frontierNeutralTargetCount === 0 ||
      (!needsFood && !needsEconomy && !settlementCandidate && frontierAnalysis.frontierEnemyTargetCount > 1))
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (
    frontierAnalysis.attack &&
    !(
      strategic.frontPosture === "CONTAIN" &&
      frontierAnalysis.frontierNeutralTargetCount > 0 &&
      (frontierAnalysis.expand || frontierAnalysis.economicExpand)
    )
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (frontierAnalysis.expand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
  }

  if (input.sessionPrefix === "ai-runtime" && !canExpand && hasCollectibleVisibleYieldSource(input.ownedTiles)) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "COLLECT_VISIBLE", {});
  }

  let noCommandReason: AutomationNoopReason;
  if (input.activeDevelopmentProcessCount >= DEVELOPMENT_PROCESS_LIMIT && frontierAnalysis.frontierEnemyTargetCount === 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "development_process_limit";
  } else if (!canExpand) {
    noCommandReason = "insufficient_points";
  } else if (!canAttack && frontierAnalysis.frontierEnemyTargetCount > 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "insufficient_manpower_for_attack";
  } else if (settlementEligible) {
    noCommandReason = "no_settlement_target";
  } else {
    noCommandReason = "no_frontier_targets";
  }
  recordPhaseTiming("summarize_frontier", summarizeStartedAt);

  return {
    diagnostic: {
      ...diagnosticBase,
      noCommandReason
    }
  };
};
