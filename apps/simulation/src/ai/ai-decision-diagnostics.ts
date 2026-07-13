/**
 * AI decision-making diagnostics: tracks why decision classes score 0 and get stuck in wait_and_recover.
 */

export type AiDecisionDiagnostic = {
  playerId: string;
  tick: number;
  canExpand: boolean;
  canAttack: boolean;
  // Score for each decision class
  scores: Record<string, number>;
  // Why each decision vetoed (first veto encountered)
  vetoes: Record<string, string | undefined>;
  // Frontier analysis state
  frontierState: {
    neutralCount: number;
    economicCount: number;
    townSupportCount: number;
    scoutCount: number;
    enemyCount: number;
    barbarianCount: number;
  };
  // Resource state
  points: number;
  manpower: number;
  // Development slots
  devSlotAvailable: boolean;
  // Winner
  winner: string;
  winnerScore: number;
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

export const getAiDecisionDiagnostics = (playerId?: string): AiDecisionDiagnostic[] => {
  if (playerId) {
    return recentDiagnostics.get(playerId) ?? [];
  }
  const all: AiDecisionDiagnostic[] = [];
  for (const diags of recentDiagnostics.values()) {
    all.push(...diags);
  }
  // Sort by timestamp descending, newest first
  return all.sort((a, b) => b.tick - a.tick);
};

export const getLatestAiDecisionDiagnostic = (playerId: string): AiDecisionDiagnostic | undefined => {
  const diags = recentDiagnostics.get(playerId);
  return diags?.[diags.length - 1];
};
