// docs/launch-attack-flag-placement-plan.md: when Launch Attack would raise
// a brand new muster flag, the player picks where it goes in the launch
// sheet. The chosen spot is recorded here, keyed by target tile -- the same
// way attackCommitByTargetKey carries the effort choice -- because the attack
// travels through the action queue before parkOrReuseMusterFlagForAttack
// decides to raise a flag. That function consumes the plan.
import { attackSyncLog } from "../client-debug/client-debug.js";

export type MusterFlagPlanEntry = { x: number; y: number; setAt: number };

type MusterFlagPlanState = { musterFlagPlanByTargetKey: Map<string, MusterFlagPlanEntry> };

// Same bounds as client-attack-commit.ts: outlives a queued attack reaching
// its park step, and can't ride along on an unrelated later attack.
export const MUSTER_FLAG_PLAN_TTL_MS = 10 * 60 * 1000;
// Hard size bound (docs/agents/state-and-persistence-discipline.md): one
// entry per target the player launched with a chosen flag spot.
export const MUSTER_FLAG_PLAN_MAX_ENTRIES = 64;

const targetKey = (x: number, y: number): string => `${x},${y}`;

export const setMusterFlagPlan = (
  state: MusterFlagPlanState,
  target: { x: number; y: number },
  spot: { x: number; y: number },
  now = Date.now()
): void => {
  const key = targetKey(target.x, target.y);
  state.musterFlagPlanByTargetKey.delete(key); // re-insert so Map order stays oldest-first for eviction
  state.musterFlagPlanByTargetKey.set(key, { x: spot.x, y: spot.y, setAt: now });
  for (const [entryKey, entry] of state.musterFlagPlanByTargetKey) {
    if (state.musterFlagPlanByTargetKey.size <= MUSTER_FLAG_PLAN_MAX_ENTRIES && now - entry.setAt <= MUSTER_FLAG_PLAN_TTL_MS) break;
    state.musterFlagPlanByTargetKey.delete(entryKey);
    attackSyncLog("muster-flag-plan-evicted", { targetKey: entryKey, ageMs: now - entry.setAt });
  }
};

export const clearMusterFlagPlan = (state: MusterFlagPlanState, x: number, y: number): void => {
  state.musterFlagPlanByTargetKey.delete(targetKey(x, y));
};

/** The planned flag spot for an attack on (x, y), removed as it is read. Undefined when none or expired. */
export const takeMusterFlagPlan = (state: MusterFlagPlanState, x: number, y: number, now = Date.now()): { x: number; y: number } | undefined => {
  const key = targetKey(x, y);
  const entry = state.musterFlagPlanByTargetKey.get(key);
  if (!entry) return undefined;
  state.musterFlagPlanByTargetKey.delete(key);
  return now - entry.setAt > MUSTER_FLAG_PLAN_TTL_MS ? undefined : { x: entry.x, y: entry.y };
};
