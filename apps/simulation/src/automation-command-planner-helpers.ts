import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";

import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { createAutomationCommand } from "./automation-command-factory.js";
import type {
  AutomationPlannerDiagnostic,
  AutomationPlannerResult,
  AutomationPlannerTile,
  AutomationPreplanProgressState,
  AutomationSessionPrefix
} from "./automation-command-planner.js";
import type { FrontierAnalysis } from "./frontier-command-planner.js";

type FrontierSelection = NonNullable<FrontierAnalysis["attack"]>;

export type AutomationPlannerDecisionContext<TTile extends AutomationPlannerTile> = {
  playerId: string;
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
  diagnostic: AutomationPlannerDiagnostic;
  settlementCandidate: TTile | undefined;
  fallbackSettlementCandidate: TTile | undefined;
  frontierAnalysis: FrontierAnalysis;
  tilesByKey: ReadonlyMap<string, TTile>;
  needsFood: boolean;
  preplanProgressState?: AutomationPreplanProgressState;
  needsEconomy: boolean;
};

export const shouldSettleCandidateNow = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  candidate: TTile
): boolean => {
  const evaluation = evaluateSettlementCandidate(
    context.playerId,
    candidate as unknown as DomainTileState,
    context.tilesByKey as ReadonlyMap<string, DomainTileState>
  );
  const isStrategicCandidate =
    Boolean(context.settlementCandidate) &&
    context.settlementCandidate?.x === candidate.x &&
    context.settlementCandidate?.y === candidate.y;
  const scaffoldOrScoutFallbackAvailable =
    context.frontierAnalysis.frontierOpportunityScaffold > 0 || context.frontierAnalysis.frontierOpportunityScout > 0;
  if (evaluation.townSupportNeed > 0 || evaluation.economicallyInteresting) return true;
  if (context.preplanProgressState === "tech_unaffordable" && !isStrategicCandidate) {
    if (
      context.frontierAnalysis.frontierOpportunityEconomic > 0 ||
      context.frontierAnalysis.frontierOpportunityScout > 0 ||
      context.frontierAnalysis.frontierOpportunityScaffold > 0
    ) {
      return evaluation.score >= 55 && (evaluation.defensivelyCompact || evaluation.supportsImmediatePlan);
    }
    return (
      evaluation.supportsImmediatePlan ||
      (evaluation.defensivelyCompact && evaluation.score >= 45) ||
      evaluation.score >= 65
    );
  }
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

export const hasActionableSettlementCandidate = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>
): boolean =>
  Boolean(
    (context.settlementCandidate && shouldSettleCandidateNow(context, context.settlementCandidate)) ||
      (context.fallbackSettlementCandidate && shouldSettleCandidateNow(context, context.fallbackSettlementCandidate))
  );

export const buildPlannerCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  type: CommandEnvelope["type"],
  payload: Record<string, number | string>
): AutomationPlannerResult => ({
  command: createAutomationCommand(
    context.sessionPrefix,
    context.playerId,
    context.clientSeq,
    context.issuedAt,
    type,
    payload
  ),
  diagnostic: context.diagnostic
});

export const buildPlannerSettleCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  tile: TTile
): AutomationPlannerResult =>
  buildPlannerCommand(context, "SETTLE", {
    x: tile.x,
    y: tile.y
  });

export const buildPlannerFrontierCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  selection: FrontierSelection,
  type: "ATTACK" | "EXPAND"
): AutomationPlannerResult =>
  buildPlannerCommand(context, type, {
    fromX: selection.from.x,
    fromY: selection.from.y,
    toX: selection.target.x,
    toY: selection.target.y
  });
