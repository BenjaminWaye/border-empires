// "Stop the leader": which rivals every AI should gang up on.
//
// Each season-victory objective names its current leader and that leader's
// 0..1 progress (1 once the win condition is met and the 24h hold is
// running). Every competitive AI reads the same objectives, so they all agree
// on who the threat is and converge on it instead of each fighting whatever
// neighbour happens to score best. The weight is 0..1 per threatening player:
//   - holding a condition (conditionMet): 1, the strongest pull
//   - close to one (progress >= VICTORY_FOCUS_MIN_PROGRESS): ramps up to
//     VICTORY_FOCUS_NEAR_WIN_MAX_WEIGHT as progress approaches 1
//   - anyone else: no entry.
// Consumers: frontier-command-planner.ts (target bonus on that player's
// tiles) and utility/decisions.ts (ATTACK/MUSTER boost when the chosen
// enemy target belongs to a focus player).
import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

/** Progress below this is ordinary competition, not a threat worth ganging up on. */
export const VICTORY_FOCUS_MIN_PROGRESS = 0.7;
/** A near-win leader never pulls as hard as one already holding a condition. */
export const VICTORY_FOCUS_NEAR_WIN_MAX_WEIGHT = 0.6;
/** Frontier score added to an enemy tile owned by a focus player, times its weight. */
export const VICTORY_FOCUS_TARGET_BONUS = 450;

export type VictoryFocusTargets = ReadonlyMap<string, number>;

const objectiveWeight = (objective: SeasonVictoryObjectiveSnapshot): number => {
  if (objective.conditionMet) return 1;
  const progress = Number.isFinite(objective.progress) ? Math.min(1, objective.progress ?? 0) : 0;
  if (progress < VICTORY_FOCUS_MIN_PROGRESS) return 0;
  return ((progress - VICTORY_FOCUS_MIN_PROGRESS) / (1 - VICTORY_FOCUS_MIN_PROGRESS)) * VICTORY_FOCUS_NEAR_WIN_MAX_WEIGHT;
};

/** Focus weight per threatening player (the strongest of its objectives). */
export const victoryFocusWeights = (objectives: readonly SeasonVictoryObjectiveSnapshot[]): Map<string, number> => {
  const weights = new Map<string, number>();
  for (const objective of objectives) {
    if (!objective.leaderPlayerId) continue;
    const weight = objectiveWeight(objective);
    if (weight <= 0) continue;
    weights.set(objective.leaderPlayerId, Math.max(weights.get(objective.leaderPlayerId) ?? 0, weight));
  }
  return weights;
};

/** The focus map as one player sees it: never itself. Undefined when nobody is a threat. */
export const victoryFocusTargetsFor = (weights: ReadonlyMap<string, number>, playerId: string): Record<string, number> | undefined => {
  let targets: Record<string, number> | undefined;
  for (const [id, weight] of weights) {
    if (id === playerId) continue;
    (targets ??= {})[id] = weight;
  }
  return targets;
};

export const victoryFocusWeightOf = (ownerId: string | undefined, targets: VictoryFocusTargets | undefined): number =>
  (ownerId && targets?.get(ownerId)) || 0;
