/**
 * Utility AI policy evaluation loop.
 *
 * Calls scoreDecision for every class, assigns WAIT the inverse of the best
 * score (floored at WAIT_FLOOR), and returns the winner plus a diagnostic
 * snapshot for logging / metrics.
 *
 * This file is the only consumer of decisions.ts; automation-command-planner
 * will call evaluateUtilityPolicy behind the AI_UTILITY_POLICY_ENABLED flag
 * once Phase 1 wires it in.
 */

import { DECISION_CLASSES, scoreDecision, type DecisionClass, type DecisionInputs } from "./decisions.js";

// WAIT acts as a catch-all: it beats all other classes only when every
// actionable class is vetoed (score 0) or very low.
const WAIT_FLOOR = 0.05;

export type UtilityPolicyResult = {
  winner: DecisionClass;
  winnerScore: number;
  runnerUp: DecisionClass;
  runnerUpScore: number;
  /** All per-class scores, for diagnostics / metrics. */
  scores: Record<DecisionClass, number>;
  /** Classes whose consideration product was 0 (vetoed), for diagnostics. */
  vetoedClasses: DecisionClass[];
};

export const evaluateUtilityPolicy = (inp: DecisionInputs): UtilityPolicyResult => {
  const scores = {} as Record<DecisionClass, number>;
  const vetoedClasses: DecisionClass[] = [];
  let bestNonWait = 0;

  for (const cls of DECISION_CLASSES) {
    if (cls === "WAIT") continue;
    const s = scoreDecision(cls, inp);
    scores[cls] = s;
    if (s === 0) vetoedClasses.push(cls);
    if (s > bestNonWait) bestNonWait = s;
  }

  // WAIT score: complement of the best non-wait score, floored.
  const waitScore = Math.max(WAIT_FLOOR, 1 - bestNonWait);
  scores["WAIT"] = waitScore;

  // Sort descending to find winner and runner-up.
  const sorted = (Object.entries(scores) as Array<[DecisionClass, number]>)
    .sort(([, a], [, b]) => b - a);

  const winner = sorted[0]?.[0] ?? "WAIT";
  const winnerScore = sorted[0]?.[1] ?? waitScore;
  const runnerUp = sorted[1]?.[0] ?? "WAIT";
  const runnerUpScore = sorted[1]?.[1] ?? 0;

  return { winner, winnerScore, runnerUp, runnerUpScore, scores, vetoedClasses };
};
