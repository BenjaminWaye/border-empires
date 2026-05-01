import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  type EconomicStructureType
} from "@border-empires/shared";

import { chooseBestSettlementTile, chooseBestStrategicSettlementTile, evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { analyzeOwnedFrontierTargetsFromLookup } from "./frontier-command-planner.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";
import { createAutomationCommand } from "./automation-command-factory.js";
import { economyWeak, foodCoverageLow, hasCollectibleVisibleYieldSource } from "./ai-economic-heuristics.js";

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

export type AutomationNoopReason = (typeof AUTOMATION_NOOP_REASONS)[number];
export type AutomationSessionPrefix = "ai-runtime" | "system-runtime";

export type AutomationPlannerTile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
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
  noCommandReason?: AutomationNoopReason;
};

export type AutomationPlannerPhase =
  | "choose_settlement"
  | "choose_frontier"
  | "summarize_frontier";

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
};

export type AutomationPlannerResult = {
  command?: CommandEnvelope;
  diagnostic: AutomationPlannerDiagnostic;
};
type FrontierSelection = NonNullable<ReturnType<typeof analyzeOwnedFrontierTargetsFromLookup>["attack"]>;

type AutomationDecisionContext<TTile extends AutomationPlannerTile> = {
  input: AutomationPlannerInput<TTile>;
  diagnosticBase: AutomationPlannerDiagnostic;
  settlementCandidate: TTile | undefined;
  fallbackSettlementCandidate: TTile | undefined;
  frontierAnalysis: ReturnType<typeof analyzeOwnedFrontierTargetsFromLookup>;
  needsFood: boolean;
  needsEconomy: boolean;
  canAttack: boolean;
  canExpand: boolean;
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

const shouldSettleCandidateNow = <TTile extends AutomationPlannerTile>(
  context: AutomationDecisionContext<TTile>,
  candidate: TTile
): boolean => {
  const evaluation = evaluateSettlementCandidate(
    context.input.playerId,
    candidate as unknown as DomainTileState,
    context.input.tilesByKey as ReadonlyMap<string, DomainTileState>
  );
  const isStrategicCandidate =
    Boolean(context.settlementCandidate) &&
    context.settlementCandidate?.x === candidate.x &&
    context.settlementCandidate?.y === candidate.y;
  const scaffoldOrScoutFallbackAvailable =
    context.frontierAnalysis.frontierOpportunityScaffold > 0 || context.frontierAnalysis.frontierOpportunityScout > 0;
  if (evaluation.townSupportNeed > 0 || evaluation.economicallyInteresting) return true;
  if (context.frontierAnalysis.frontierEnemyTargetCount > 0 && context.frontierAnalysis.frontierNeutralTargetCount === 0) {
    return evaluation.defensivelyCompact || evaluation.score >= 40;
  }
  if (!isStrategicCandidate && scaffoldOrScoutFallbackAvailable) return false;
  if (context.needsFood || context.needsEconomy) return evaluation.defensivelyCompact || evaluation.score >= 45;
  return (
    evaluation.supportsImmediatePlan ||
    evaluation.defensivelyCompact ||
    (context.frontierAnalysis.frontierOpportunityScaffold <= 0 &&
      context.frontierAnalysis.frontierOpportunityScout <= 0 &&
      context.frontierAnalysis.frontierOpportunityEconomic <= 0 &&
      evaluation.score >= 10)
  );
};

const hasActionableSettlementCandidate = <TTile extends AutomationPlannerTile>(
  context: AutomationDecisionContext<TTile>
): boolean =>
  Boolean(
    (context.settlementCandidate && shouldSettleCandidateNow(context, context.settlementCandidate)) ||
      (context.fallbackSettlementCandidate && shouldSettleCandidateNow(context, context.fallbackSettlementCandidate))
  );

const economicRecoveryPreferred = <TTile extends AutomationPlannerTile>(context: AutomationDecisionContext<TTile>): boolean => {
  if (hasActionableSettlementCandidate(context)) return false;
  return (
    context.needsFood ||
    context.needsEconomy ||
    context.frontierAnalysis.frontierOpportunityEconomic > 0 ||
    context.frontierAnalysis.frontierOpportunityScaffold > 0 ||
    !context.settlementCandidate
  );
};

const buildCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationDecisionContext<TTile>,
  type: CommandEnvelope["type"],
  payload: Record<string, number | string>
): AutomationPlannerResult => ({
  command: createAutomationCommand(
    context.input.sessionPrefix,
    context.input.playerId,
    context.input.clientSeq,
    context.input.issuedAt,
    type,
    payload
  ),
  diagnostic: context.diagnosticBase
});

const buildSettleCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationDecisionContext<TTile>,
  tile: TTile
): AutomationPlannerResult =>
  buildCommand(context, "SETTLE", {
    x: tile.x,
    y: tile.y
  });

const buildFrontierCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationDecisionContext<TTile>,
  selection: FrontierSelection,
  type: "ATTACK" | "EXPAND"
): AutomationPlannerResult =>
  buildCommand(context, type, {
    fromX: selection.from.x,
    fromY: selection.from.y,
    toX: selection.target.x,
    toY: selection.target.y
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
  const frontierOrigins =
    input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.strategicFrontierTiles?.length
        ? input.strategicFrontierTiles
        : input.frontierTiles.length > 0
          ? input.frontierTiles
          : input.ownedTiles;
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
  const context: AutomationDecisionContext<TTile> = {
    input,
    diagnosticBase,
    settlementCandidate: settlementCandidate as TTile | undefined,
    fallbackSettlementCandidate: fallbackSettlementCandidate as TTile | undefined,
    frontierAnalysis,
    needsFood,
    needsEconomy,
    canAttack,
    canExpand
  };
  const summarizeStartedAt = Date.now();
  const actionableFallbackSettlementCandidate =
    fallbackSettlementCandidate && shouldSettleCandidateNow(context, fallbackSettlementCandidate as TTile)
      ? (fallbackSettlementCandidate as TTile)
      : undefined;

  if (settlementCandidate) {
    if (shouldSettleCandidateNow(context, settlementCandidate as TTile)) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildSettleCommand(context, settlementCandidate as TTile);
    }
  }

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
    const economicBuild = chooseBestEconomicBuild(structurePlayer, buildTiles, input.tilesByKey);
    if (economicBuild && economicRecoveryPreferred(context)) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
        x: economicBuild.tile.x,
        y: economicBuild.tile.y,
        structureType: economicBuild.structureType
      });
    }

    const fortBuild = chooseBestFortBuild(structurePlayer, buildTiles, input.tilesByKey);
    if (
      fortBuild &&
      frontierAnalysis.frontierEnemyTargetCount > 0 &&
      frontierAnalysis.frontierNeutralTargetCount === 0 &&
      !settlementCandidate &&
      !actionableFallbackSettlementCandidate
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildCommand(context, "BUILD_FORT", {
        x: fortBuild.x,
        y: fortBuild.y
      });
    }

    const siegeOutpostBuild = chooseBestSiegeOutpostBuild(structurePlayer, buildTiles, input.tilesByKey);
    if (
      siegeOutpostBuild &&
      frontierAnalysis.attack &&
      frontierAnalysis.frontierEnemyTargetCount > 1 &&
      !settlementCandidate &&
      !actionableFallbackSettlementCandidate
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return buildCommand(context, "BUILD_SIEGE_OUTPOST", {
        x: siegeOutpostBuild.x,
        y: siegeOutpostBuild.y
      });
    }
  }

  if (
    frontierAnalysis.economicExpand &&
    canExpand &&
    !actionableFallbackSettlementCandidate &&
    (needsFood ||
      needsEconomy ||
      (!settlementCandidate && frontierAnalysis.frontierOpportunityEconomic > 0))
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
  }

  if (actionableFallbackSettlementCandidate) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildSettleCommand(context, actionableFallbackSettlementCandidate);
  }

  if (
    frontierAnalysis.scaffoldExpand &&
    canExpand &&
    (!fallbackSettlementCandidate || frontierAnalysis.frontierOpportunityScaffold > 0)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.scaffoldExpand, "EXPAND");
  }

  if (
    frontierAnalysis.scoutExpand &&
    canExpand &&
    (frontierAnalysis.frontierOpportunityWaste > 0 || frontierAnalysis.frontierOpportunityScout > 0)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (
    frontierAnalysis.attack &&
    canAttack &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    (frontierAnalysis.frontierNeutralTargetCount === 0 ||
      (!needsFood && !needsEconomy && !settlementCandidate && frontierAnalysis.frontierEnemyTargetCount > 1))
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (frontierAnalysis.attack) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (frontierAnalysis.expand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
  }

  if (input.sessionPrefix === "ai-runtime" && !canExpand && hasCollectibleVisibleYieldSource(input.ownedTiles)) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildCommand(context, "COLLECT_VISIBLE", {});
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
