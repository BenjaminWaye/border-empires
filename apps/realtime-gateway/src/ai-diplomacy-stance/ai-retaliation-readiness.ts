// Whether an AI that was just attacked would rather hit back than talk peace.
//
// The old rule refused every truce for 30 minutes after the player attacked
// (Civ's "too soon after declaring war"). In practice players attack, offer a
// truce and log off, so the flat cooldown just meant the offer died and the
// AI sat on an open border it had no plan to use. Now the cooldown only holds
// while the AI actually has a counter-attack in hand:
//   - its fighting strength (free + mustered manpower, plus a refill landing
//     before the cooldown ends) is at least half its cap, and
//   - the requester's border is worth fighting over: it is the AI's only way
//     to grow (boxed in), or the AI is winning the war there.
// Otherwise a truce frees the AI to spend its manpower on other fronts, so it
// deals -- at a fresh-aggression surcharge on top of the usual reparations, so
// attack-then-truce never comes cheap.
import { fightingStrengthOf, type WarExhaustionInput } from "./ai-war-exhaustion.js";

/** Fighting strength at or above this share of cap means a counter-attack is ready. */
export const RETALIATION_READY_RATIO = 0.5;

export type AiRetaliationReadiness = {
  /** Free + mustered manpower (plus a refill due inside the window) as a share of cap, 0..1. */
  readiness: number;
  ready: boolean;
  /** The requester's border is the AI's only way to grow. */
  boxedIn: boolean;
};

export const aiRetaliationReadiness = (ai: WarExhaustionInput, cooldownRemainingMs: number): AiRetaliationReadiness => {
  const boxedIn = ai.hasOtherExpansion === false;
  if (ai.manpowerCap <= 0) return { readiness: 0, ready: false, boxedIn };
  const refillInWindow = ai.nextRefillInMs !== undefined && ai.nextRefillInMs <= cooldownRemainingMs ? ai.nextRefillManpower ?? 0 : 0;
  const readiness = Math.min(1, Math.max(0, (fightingStrengthOf(ai) + refillInWindow) / ai.manpowerCap));
  return { readiness, ready: readiness >= RETALIATION_READY_RATIO, boxedIn };
};
