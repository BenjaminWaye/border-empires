/**
 * AI decision-making diagnostics: tracks why decision classes score 0 and get
 * stuck in wait_and_recover.
 *
 * IMPORTANT — worker boundary: AI planning runs in a separate worker thread
 * when SIMULATION_AI_WORKER is set (staging/prod). The planner's
 * AutomationPlannerDiagnostic is what crosses back to the sim worker (via
 * postMessage), so recording MUST happen sim-side from that diagnostic —
 * recordAiDecisionDiagnosticFromPlanner is called from the sim worker's
 * onDecision/onNoCommand callbacks. A Map written inside runUtilityPolicy would
 * live in the AI worker's module instance, which the GetAiDecisionDiagnostics
 * RPC (running in the sim worker) can never read.
 */

import type { AutomationPlannerDiagnostic } from "./automation-command-planner-types.js";

export type AiDecisionDiagnostic = {
  playerId: string;
  recordedAt: number;
  canExpand: boolean;
  canAttack: boolean;
  scores: Record<string, number>;
  vetoedClasses: readonly string[];
  frontierState: {
    neutralCount: number;
    economicCount: number;
    townSupportCount: number;
    scoutCount: number;
    enemyCount: number;
    barbarianCount: number;
  };
  winner: string | undefined;
  winnerScore: number | undefined;
  noCommandReason: string | undefined;
  gates: AutomationPlannerDiagnostic["utilityGates"];
};

const recentDiagnostics = new Map<string, AiDecisionDiagnostic[]>();
const MAX_DIAGNOSTICS_PER_PLAYER = 100;

export const recordAiDecisionDiagnostic = (diag: AiDecisionDiagnostic): void => {
  const existing = recentDiagnostics.get(diag.playerId) ?? [];
  existing.push(diag);
  if (existing.length > MAX_DIAGNOSTICS_PER_PLAYER) {
    existing.shift();
  }
  recentDiagnostics.set(diag.playerId, existing);
};

/**
 * Build and record an AiDecisionDiagnostic from the planner diagnostic that
 * crossed the worker boundary. Call this from the sim worker's
 * onDecision/onNoCommand callbacks. Skips planner diagnostics that never ran
 * the utility policy (e.g. preplan-only results with no utilityScores).
 */
export const recordAiDecisionDiagnosticFromPlanner = (
  diagnostic: AutomationPlannerDiagnostic
): void => {
  if (!diagnostic.utilityScores) return;
  recordAiDecisionDiagnostic({
    playerId: diagnostic.playerId,
    recordedAt: Date.now(),
    canExpand: diagnostic.canExpand,
    canAttack: diagnostic.canAttack,
    scores: diagnostic.utilityScores,
    vetoedClasses: diagnostic.utilityVetoedClasses ?? [],
    frontierState: {
      neutralCount: diagnostic.frontierNeutralTargetCount,
      economicCount: diagnostic.frontierOpportunityEconomic ?? 0,
      townSupportCount: diagnostic.frontierOpportunityTownSupport ?? 0,
      scoutCount: diagnostic.frontierOpportunityScout ?? 0,
      enemyCount: diagnostic.frontierEnemyTargetCount,
      barbarianCount: diagnostic.frontierBarbarianTargetCount ?? 0
    },
    winner: diagnostic.utilityWinner,
    winnerScore: diagnostic.utilityWinnerScore,
    noCommandReason: diagnostic.noCommandReason,
    gates: diagnostic.utilityGates
  });
};

export const getAiDecisionDiagnostics = (playerId?: string): AiDecisionDiagnostic[] => {
  if (playerId) {
    return [...(recentDiagnostics.get(playerId) ?? [])].reverse();
  }
  const all: AiDecisionDiagnostic[] = [];
  for (const diags of recentDiagnostics.values()) {
    all.push(...diags);
  }
  return all.sort((a, b) => b.recordedAt - a.recordedAt);
};

export const getLatestAiDecisionDiagnostic = (playerId: string): AiDecisionDiagnostic | undefined => {
  const diags = recentDiagnostics.get(playerId);
  return diags?.[diags.length - 1];
};
