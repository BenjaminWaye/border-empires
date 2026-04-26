import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST
} from "@border-empires/shared";

import { chooseBestStrategicSettlementTile } from "./ai-settlement-priority.js";
import { analyzeOwnedFrontierTargetsFromLookup } from "./frontier-command-planner.js";

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
  resource?: string | undefined;
  dockId?: string | undefined;
  town?: { supportMax?: number | undefined; supportCurrent?: number | undefined } | null | undefined;
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
  hasActiveLock: boolean;
  activeDevelopmentProcessCount: number;
  frontierTiles: readonly TTile[];
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
  payload: Record<string, number>
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
        input.frontierTiles as unknown as Iterable<DomainTileState>,
        input.tilesByKey as ReadonlyMap<string, DomainTileState>,
        input.isPendingSettlement
          ? (tile) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false
          : undefined
      )
    : undefined;
  recordPhaseTiming("choose_settlement", settlementStartedAt);

  if (settlementCandidate) {
    return {
      command: createCommand(
        input.sessionPrefix,
        input.playerId,
        input.clientSeq,
        input.issuedAt,
        "SETTLE",
        { x: settlementCandidate.x, y: settlementCandidate.y }
      ),
      diagnostic: {
        playerId: input.playerId,
        sessionPrefix: input.sessionPrefix,
        settlementEligible,
        settlementCandidateFound: true,
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 0,
        canAttack: input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN,
        canExpand: input.points >= FRONTIER_CLAIM_COST
      }
    };
  }

  const canAttack = input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = input.points >= FRONTIER_CLAIM_COST;
  const frontierOrigins = input.frontierTiles.length > 0 ? input.frontierTiles : input.ownedTiles;
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
          frontierNeutralTargetCount: 0
        };
  recordPhaseTiming("choose_frontier", frontierStartedAt);
  const frontierCommand = frontierAnalysis.attack
    ? {
        commandId: `${input.sessionPrefix}-${input.playerId}-${input.clientSeq}-${input.issuedAt}`,
        sessionId: `${input.sessionPrefix}:${input.playerId}`,
        playerId: input.playerId,
        clientSeq: input.clientSeq,
        issuedAt: input.issuedAt,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({
          fromX: frontierAnalysis.attack.from.x,
          fromY: frontierAnalysis.attack.from.y,
          toX: frontierAnalysis.attack.target.x,
          toY: frontierAnalysis.attack.target.y
        })
      }
    : frontierAnalysis.expand
      ? {
          commandId: `${input.sessionPrefix}-${input.playerId}-${input.clientSeq}-${input.issuedAt}`,
          sessionId: `${input.sessionPrefix}:${input.playerId}`,
          playerId: input.playerId,
          clientSeq: input.clientSeq,
          issuedAt: input.issuedAt,
          type: "EXPAND" as const,
          payloadJson: JSON.stringify({
            fromX: frontierAnalysis.expand.from.x,
            fromY: frontierAnalysis.expand.from.y,
            toX: frontierAnalysis.expand.target.x,
            toY: frontierAnalysis.expand.target.y
          })
        }
      : undefined;
  if (frontierCommand) {
    const summarizeStartedAt = Date.now();
    const frontierSummary = {
      frontierEnemyTargetCount: frontierAnalysis.frontierEnemyTargetCount,
      frontierNeutralTargetCount: frontierAnalysis.frontierNeutralTargetCount
    };
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return {
      command: frontierCommand,
      diagnostic: {
        playerId: input.playerId,
        sessionPrefix: input.sessionPrefix,
        settlementEligible,
        settlementCandidateFound: false,
        ...frontierSummary,
        canAttack,
        canExpand
      }
    };
  }

  const summarizeStartedAt = Date.now();
  const frontierSummary = {
    frontierEnemyTargetCount: frontierAnalysis.frontierEnemyTargetCount,
    frontierNeutralTargetCount: frontierAnalysis.frontierNeutralTargetCount
  };
  recordPhaseTiming("summarize_frontier", summarizeStartedAt);
  let noCommandReason: AutomationNoopReason;
  if (input.activeDevelopmentProcessCount >= DEVELOPMENT_PROCESS_LIMIT && frontierSummary.frontierEnemyTargetCount === 0 && frontierSummary.frontierNeutralTargetCount === 0) {
    noCommandReason = "development_process_limit";
  } else if (!canExpand) {
    noCommandReason = "insufficient_points";
  } else if (
    !canAttack &&
    frontierSummary.frontierEnemyTargetCount > 0 &&
    frontierSummary.frontierNeutralTargetCount === 0
  ) {
    noCommandReason = "insufficient_manpower_for_attack";
  } else if (settlementEligible) {
    noCommandReason = "no_settlement_target";
  } else {
    noCommandReason = "no_frontier_targets";
  }

  return {
    diagnostic: {
      playerId: input.playerId,
      sessionPrefix: input.sessionPrefix,
      settlementEligible,
      settlementCandidateFound: false,
      ...frontierSummary,
      canAttack,
      canExpand,
      noCommandReason
    }
  };
};
