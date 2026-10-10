// docs/replenishment-update-plan.md D6: a manual attack may commit more than
// the target's muster floor for better odds. The Launch Attack / Expand To &
// Attack effort dialog records the chosen commitManpower here, keyed by
// target tile, rather than threading it through every queue the attack can
// pass through on its way out (actionQueue -> pendingMusterAttacks ->
// deferredAttackByTile). Every ATTACK send point reads it back via
// attackWireMessage, and every client-side muster-funding check reads it via
// requiredMusterWithCommit so a flag holding only the floor isn't mistaken
// for one that can fund the full commitment (the server's resolveMusterSource
// would reject that as INSUFFICIENT_MUSTER).
import { defendingFortVariant, requiredMusterForFort, requiredMusterForTarget } from "@border-empires/shared";
import { attackSyncLog } from "../client-debug/client-debug.js";
import type { ClientWaypoint } from "../client-state/client-waypoint-state.js";
import type { Tile } from "../client-types.js";

export type AttackCommitEntry = { commitManpower: number; setAt: number };

type AttackCommitState = {
  attackCommitByTargetKey: Map<string, AttackCommitEntry>;
  tiles: Map<string, Tile>;
};

// Long enough to outlive a parked attack's whole muster wait
// (MUSTER_PENDING_HARD_TIMEOUT_MS, 5 min) plus its march; short enough that
// a stale choice can't silently ride along on some unrelated later attack.
export const ATTACK_COMMIT_TTL_MS = 10 * 60 * 1000;
// Hard size bound (docs/agents/state-and-persistence-discipline.md) -- one
// entry per target the player has actively chosen an effort level for.
export const ATTACK_COMMIT_MAX_ENTRIES = 64;

const targetKey = (x: number, y: number): string => `${x},${y}`;

/**
 * Only SETTLED, non-barbarian targets benefit from committing extra: the
 * server scales odds by commit/floor for those alone (runtime-combat-
 * support.ts isCommitEligible), while still charging the full commitment for
 * any target -- so offering the choice elsewhere would just burn manpower.
 */
export const isAttackEffortEligibleTarget = (tile: Tile | undefined): tile is Tile =>
  Boolean(tile && tile.ownerId && tile.ownerId !== "barbarian-1" && tile.ownershipState === "SETTLED");

/** The commit floor for a target: its fort-ladder attack cost (same rule the muster commit tab uses). */
export const attackEffortFloorForTarget = (tile: Tile): number => requiredMusterForFort(defendingFortVariant(tile.fort));

export const setAttackCommit = (state: AttackCommitState, x: number, y: number, commitManpower: number, now = Date.now()): void => {
  const key = targetKey(x, y);
  state.attackCommitByTargetKey.delete(key); // re-insert so Map order stays oldest-first for eviction
  state.attackCommitByTargetKey.set(key, { commitManpower, setAt: now });
  for (const [entryKey, entry] of state.attackCommitByTargetKey) {
    if (state.attackCommitByTargetKey.size <= ATTACK_COMMIT_MAX_ENTRIES && now - entry.setAt <= ATTACK_COMMIT_TTL_MS) break;
    state.attackCommitByTargetKey.delete(entryKey);
    attackSyncLog("attack-commit-evicted", { targetKey: entryKey, ageMs: now - entry.setAt });
  }
};

export const clearAttackCommit = (state: Pick<AttackCommitState, "attackCommitByTargetKey">, x: number, y: number): void => {
  state.attackCommitByTargetKey.delete(targetKey(x, y));
};

/** The chosen commitment for (x, y), if one is recorded, unexpired, and the target is still eligible right now. */
export const attackCommitForTarget = (state: AttackCommitState, x: number, y: number, now = Date.now()): number | undefined => {
  const key = targetKey(x, y);
  const entry = state.attackCommitByTargetKey.get(key);
  if (!entry) return undefined;
  if (now - entry.setAt > ATTACK_COMMIT_TTL_MS) {
    state.attackCommitByTargetKey.delete(key);
    return undefined;
  }
  return isAttackEffortEligibleTarget(state.tiles.get(key)) ? entry.commitManpower : undefined;
};

/** requiredMusterForTarget, raised to the player's chosen commitment for that target when there is one. */
export const requiredMusterWithCommit = (state: AttackCommitState, target: Tile | undefined): number => {
  const base = requiredMusterForTarget(target);
  if (!target) return base;
  return Math.max(base, attackCommitForTarget(state, target.x, target.y) ?? 0);
};

export type AttackWireMessage = {
  type: "ATTACK";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  commandId: string;
  clientSeq: number;
  commitManpower?: number;
};

/** The ATTACK wire message, carrying the recorded commitment (if any) unless one is passed explicitly. */
export const attackWireMessage = (
  state: AttackCommitState,
  args: { fromX: number; fromY: number; toX: number; toY: number; commandId: string; clientSeq: number; commitManpower?: number | undefined }
): AttackWireMessage => {
  const commitManpower = args.commitManpower ?? attackCommitForTarget(state, args.toX, args.toY);
  return {
    type: "ATTACK",
    fromX: args.fromX,
    fromY: args.fromY,
    toX: args.toX,
    toY: args.toY,
    commandId: args.commandId,
    clientSeq: args.clientSeq,
    ...(commitManpower != null ? { commitManpower } : {})
  };
};

/**
 * Called when the waypoint top-up hands a step to the action queue. When
 * that step is the waypoint's final ATTACK on its own target, record the
 * effort the player chose for it so the eventual send carries it.
 */
export const noteWaypointStepEnqueued = (
  state: AttackCommitState,
  waypoint: ClientWaypoint,
  step: { target: { x: number; y: number }; action: "EXPAND" | "ATTACK" },
  stepKey: string
): void => {
  waypoint.lastEnqueuedKey = stepKey;
  const isFinalAttack = step.action === "ATTACK" && step.target.x === waypoint.target.x && step.target.y === waypoint.target.y;
  if (isFinalAttack && waypoint.commitManpower != null) setAttackCommit(state, step.target.x, step.target.y, waypoint.commitManpower);
};
