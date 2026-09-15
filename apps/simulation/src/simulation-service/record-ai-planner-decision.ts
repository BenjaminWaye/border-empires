import { recordAiDecisionDiagnosticFromPlanner } from "../ai/ai-decision-diagnostics.js";
import type { AutomationPlannerDiagnostic } from "../ai/automation-command-planner.js";
import type { SimulationMetrics } from "../metrics/metrics.js";
import type { SimulationRuntime } from "../runtime/runtime.js";

// Extracted from simulation-service.ts (which sits at the repo's 500-line
// file cap) to make room for new metrics wiring without growing that file
// past the cap.
//
// Shared body of the two (worker/in-process) onDecision handlers in
// simulation-service.ts — identical apart from expansionObjectiveKind,
// which the in-process path simply never sets (the check is then a
// harmless no-op there). Only the worker path also needs
// recordAiAutomationDiagnosticFeedback: the in-process path already applies
// that same productive/streak bookkeeping inline inside
// explainNextAutomationCommand, so calling it again here would double-count
// it.
export const recordAiPlannerDecision = (
  source: "worker" | "runtime",
  diagnostic: AutomationPlannerDiagnostic,
  simulationMetrics: SimulationMetrics,
  runtime: SimulationRuntime
): void => {
  if (diagnostic.preplanReason) simulationMetrics.observeSimAiPreplan(diagnostic.preplanReason, diagnostic.playerId);
  if (diagnostic.preplanProgressState) {
    simulationMetrics.observeSimAiPreplanProgress(diagnostic.preplanProgressState, diagnostic.playerId);
  }
  if (diagnostic.broadFallbackSkipped) simulationMetrics.incrementSimAiBroadFallbackSkipped(diagnostic.playerId);
  if (diagnostic.narrowAnalyzeCapped) simulationMetrics.incrementSimAiNarrowAnalyzeCapped(diagnostic.playerId);
  // Observability for ai-spatial-focus.ts's per-tick cap (PR #1954): a
  // front size that's always 0/undefined means the cap is silently disabled
  // for that player, and a persistently nonzero fallback rate means the cap
  // isn't actually restricting anything for them despite being wired.
  if (typeof diagnostic.spatialFocusFrontSize === "number") {
    simulationMetrics.setSimAiFocusFrontSize(diagnostic.playerId, diagnostic.spatialFocusFrontSize);
  }
  if (diagnostic.spatialFocusFallback) simulationMetrics.incrementSimAiFocusFallback(diagnostic.playerId);
  if (diagnostic.expansionObjectiveKind) simulationMetrics.observeSimAiExpansionObjective(diagnostic.expansionObjectiveKind);
  if (diagnostic.utilityWinner) simulationMetrics.observeSimAiUtilityDecision(diagnostic.utilityWinner, diagnostic.playerId);
  if (source === "worker") runtime.recordAiAutomationDiagnosticFeedback(diagnostic.playerId, diagnostic);
  recordAiDecisionDiagnosticFromPlanner(diagnostic);
};
