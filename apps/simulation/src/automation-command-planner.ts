import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  type EconomicStructureType
} from "@border-empires/shared";

import { chooseBestStrategicSettlementTile, evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { analyzeOwnedFrontierTargetsFromLookup } from "./frontier-command-planner.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";

type StrategicResourceKey = DomainStrategicResourceKey;

export const AUTOMATION_NOOP_REASONS = [
  "player_missing",
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

const createCommand = (
  sessionPrefix: AutomationSessionPrefix,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  type: CommandEnvelope["type"],
  payload: Record<string, number | string>
): CommandEnvelope => ({
  commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
  sessionId: `${sessionPrefix}:${playerId}`,
  playerId,
  clientSeq,
  issuedAt,
  type,
  payloadJson: JSON.stringify(payload)
});

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

const foodCoverageLow = (
  strategicResources: Partial<Record<StrategicResourceKey, number>> | undefined,
  townCount: number
): boolean => Math.max(0, strategicResources?.FOOD ?? 0) <= Math.max(24, townCount * 12);

const economyWeak = (incomePerMinute: number, settledTileCount: number): boolean =>
  incomePerMinute < Math.max(3, settledTileCount * 0.45);

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
  const settlementCandidate = settlementEligible
    ? chooseBestStrategicSettlementTile(
        input.playerId,
        (input.strategicFrontierTiles?.length ? input.strategicFrontierTiles : input.frontierTiles) as unknown as Iterable<DomainTileState>,
        input.tilesByKey as ReadonlyMap<string, DomainTileState>,
        input.isPendingSettlement
          ? (tile) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false
          : undefined
      )
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
  const summarizeStartedAt = Date.now();

  if (settlementCandidate) {
    const evaluation = evaluateSettlementCandidate(
      input.playerId,
      settlementCandidate as DomainTileState,
      input.tilesByKey as ReadonlyMap<string, DomainTileState>
    );
    const shouldSettleNow =
      evaluation.townSupportNeed > 0 ||
      evaluation.economicallyInteresting ||
      !needsEconomy ||
      (frontierAnalysis.frontierOpportunityScaffold <= 0 && frontierAnalysis.frontierOpportunityEconomic <= 0);
    if (shouldSettleNow) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return {
        command: createCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, "SETTLE", {
          x: settlementCandidate.x,
          y: settlementCandidate.y
        }),
        diagnostic: diagnosticBase
      };
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
    if (
      economicBuild &&
      (needsFood ||
        needsEconomy ||
        (!settlementCandidate && frontierAnalysis.frontierOpportunityEconomic <= 0 && frontierAnalysis.frontierOpportunityScaffold <= 0))
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return {
        command: createCommand(
          input.sessionPrefix,
          input.playerId,
          input.clientSeq,
          input.issuedAt,
          "BUILD_ECONOMIC_STRUCTURE",
          {
            x: economicBuild.tile.x,
            y: economicBuild.tile.y,
            structureType: economicBuild.structureType
          }
        ),
        diagnostic: diagnosticBase
      };
    }

    const fortBuild = chooseBestFortBuild(structurePlayer, buildTiles, input.tilesByKey);
    if (
      fortBuild &&
      frontierAnalysis.frontierEnemyTargetCount > 0 &&
      frontierAnalysis.frontierNeutralTargetCount === 0 &&
      !settlementCandidate
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return {
        command: createCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, "BUILD_FORT", {
          x: fortBuild.x,
          y: fortBuild.y
        }),
        diagnostic: diagnosticBase
      };
    }

    const siegeOutpostBuild = chooseBestSiegeOutpostBuild(structurePlayer, buildTiles, input.tilesByKey);
    if (
      siegeOutpostBuild &&
      frontierAnalysis.attack &&
      frontierAnalysis.frontierEnemyTargetCount > 1 &&
      !settlementCandidate
    ) {
      recordPhaseTiming("summarize_frontier", summarizeStartedAt);
      return {
        command: createCommand(
          input.sessionPrefix,
          input.playerId,
          input.clientSeq,
          input.issuedAt,
          "BUILD_SIEGE_OUTPOST",
          {
            x: siegeOutpostBuild.x,
            y: siegeOutpostBuild.y
          }
        ),
        diagnostic: diagnosticBase
      };
    }
  }

  if (frontierAnalysis.attack) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return {
      command: createCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, "ATTACK", {
        fromX: frontierAnalysis.attack.from.x,
        fromY: frontierAnalysis.attack.from.y,
        toX: frontierAnalysis.attack.target.x,
        toY: frontierAnalysis.attack.target.y
      }),
      diagnostic: diagnosticBase
    };
  }

  if (frontierAnalysis.expand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return {
      command: createCommand(input.sessionPrefix, input.playerId, input.clientSeq, input.issuedAt, "EXPAND", {
        fromX: frontierAnalysis.expand.from.x,
        fromY: frontierAnalysis.expand.from.y,
        toX: frontierAnalysis.expand.target.x,
        toY: frontierAnalysis.expand.target.y
      }),
      diagnostic: diagnosticBase
    };
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
