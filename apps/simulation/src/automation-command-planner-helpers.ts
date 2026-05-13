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

export const AUTOMATION_SETTLE_DECISION_REASONS = [
  "settled_economically_interesting",
  "settled_tech_unaffordable_strict",
  "settled_tech_unaffordable_default",
  "settled_enemy_pressure",
  "settled_needs_economy_or_food",
  "settled_surplus",
  "skip_tech_unaffordable_strict",
  "skip_tech_unaffordable_default",
  "skip_enemy_pressure_score_low",
  "skip_scaffold_or_scout_fallback",
  "skip_needs_economy_or_food_score_low",
  "skip_surplus_floor",
  "skip_surplus_alternatives_present"
] as const;

export type AutomationSettleDecisionReason = (typeof AUTOMATION_SETTLE_DECISION_REASONS)[number];

export type AutomationSettleDecision = {
  shouldSettle: boolean;
  reason: AutomationSettleDecisionReason;
  topScore: number;
  evaluationStrategic: boolean;
  evaluationDefensivelyCompact: boolean;
  evaluationSupportsImmediatePlan: boolean;
  evaluationEconomicallyInteresting: boolean;
  candidateHasIntrinsicEconomicValue: boolean;
};

// Returns the decision plus the reason — used both for the gate ('shouldSettle')
// and for diagnostics ('reason' is fed to a metric so we can see in staging why
// AIs aren't actually settling). Keep `shouldSettleCandidateNow` as a thin
// boolean wrapper so existing call sites don't have to change.
export const evaluateSettleCandidateDecision = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  candidate: TTile
): AutomationSettleDecision => {
  const evaluation = evaluateSettlementCandidate(
    context.playerId,
    candidate as unknown as DomainTileState,
    context.tilesByKey as ReadonlyMap<string, DomainTileState>
  );
  const base = {
    topScore: Number.isFinite(evaluation.score) ? evaluation.score : 0,
    evaluationStrategic: evaluation.strategic,
    evaluationDefensivelyCompact: evaluation.defensivelyCompact,
    evaluationSupportsImmediatePlan: evaluation.supportsImmediatePlan,
    evaluationEconomicallyInteresting: evaluation.economicallyInteresting,
    candidateHasIntrinsicEconomicValue: Boolean(candidate.town || candidate.dockId || candidate.resource)
  } as const;
  const isStrategicCandidate =
    Boolean(context.settlementCandidate) &&
    context.settlementCandidate?.x === candidate.x &&
    context.settlementCandidate?.y === candidate.y;
  const scaffoldOrScoutFallbackAvailable =
    context.frontierAnalysis.frontierOpportunityScaffold > 0 || context.frontierAnalysis.frontierOpportunityScout > 0;

  if (evaluation.economicallyInteresting && (base.candidateHasIntrinsicEconomicValue || !context.needsFood)) {
    return { ...base, shouldSettle: true, reason: "settled_economically_interesting" };
  }
  // economicallyInteresting + needsFood (no intrinsic value) falls through to
  // the remaining gates below — same as the original boolean implementation.
  if (context.preplanProgressState === "tech_unaffordable" && !isStrategicCandidate) {
    if (
      context.frontierAnalysis.frontierOpportunityEconomic > 0 ||
      context.frontierAnalysis.frontierOpportunityScout > 0 ||
      context.frontierAnalysis.frontierOpportunityScaffold > 0
    ) {
      const ok = evaluation.score >= 55 && (evaluation.defensivelyCompact || evaluation.supportsImmediatePlan);
      return {
        ...base,
        shouldSettle: ok,
        reason: ok ? "settled_tech_unaffordable_strict" : "skip_tech_unaffordable_strict"
      };
    }
    const ok =
      evaluation.supportsImmediatePlan ||
      (evaluation.defensivelyCompact && evaluation.score >= 45) ||
      evaluation.score >= 65;
    return {
      ...base,
      shouldSettle: ok,
      reason: ok ? "settled_tech_unaffordable_default" : "skip_tech_unaffordable_default"
    };
  }
  if (context.frontierAnalysis.frontierEnemyTargetCount > 0 && context.frontierAnalysis.frontierNeutralTargetCount === 0) {
    const ok = evaluation.defensivelyCompact || evaluation.score >= 40;
    return {
      ...base,
      shouldSettle: ok,
      reason: ok ? "settled_enemy_pressure" : "skip_enemy_pressure_score_low"
    };
  }
  if (!isStrategicCandidate && scaffoldOrScoutFallbackAvailable) {
    return { ...base, shouldSettle: false, reason: "skip_scaffold_or_scout_fallback" };
  }
  if (context.needsFood || context.needsEconomy) {
    const ok = evaluation.defensivelyCompact || evaluation.score >= 45;
    return {
      ...base,
      shouldSettle: ok,
      reason: ok ? "settled_needs_economy_or_food" : "skip_needs_economy_or_food_score_low"
    };
  }
  // Surplus path floor was 10, which let through near-empty filler tiles.
  // Each SETTLE costs 4 gold — at 174 settled / 19 income (real staging case)
  // the AI was draining its tech budget on tiles with score 10-30. Bump the
  // floor to 30 (≈1 settled neighbor + clustering bonus) so we only fill in
  // tiles that actually shape territory, not pure fillers.
  if (evaluation.supportsImmediatePlan || evaluation.defensivelyCompact) {
    return { ...base, shouldSettle: true, reason: "settled_surplus" };
  }
  const noAlternatives =
    context.frontierAnalysis.frontierOpportunityScaffold <= 0 &&
    context.frontierAnalysis.frontierOpportunityScout <= 0 &&
    context.frontierAnalysis.frontierOpportunityEconomic <= 0;
  if (!noAlternatives) {
    return { ...base, shouldSettle: false, reason: "skip_surplus_alternatives_present" };
  }
  const ok = evaluation.score >= 30;
  return {
    ...base,
    shouldSettle: ok,
    reason: ok ? "settled_surplus" : "skip_surplus_floor"
  };
};

export const shouldSettleCandidateNow = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  candidate: TTile
): boolean => evaluateSettleCandidateDecision(context, candidate).shouldSettle;

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
