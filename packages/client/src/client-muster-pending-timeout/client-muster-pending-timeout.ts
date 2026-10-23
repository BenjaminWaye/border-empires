import { attackCommitForTarget, setAttackCommit, type AttackCommitEntry } from "../client-attack-commit/client-attack-commit.js";
import type { Tile } from "../client-types.js";

// Backstop so a parked attack can never sit in pendingMusterAttacks forever
// with no feedback. dropStuckPendingMusterAttack (client-muster-attack-gate.ts)
// only fires when a brand-new flag was just requested (entry.musterRequestedAt
// set) — an entry parked against an already-existing flag has no such field,
// so if that flag never becomes usable (cleared, captured away, amount/
// required never converging, or any other reason) it previously had no
// expiry at all. This cap is independent of *why* it's stuck — it guarantees
// eventual feedback regardless of which sub-condition is failing.
//
// Measured from the flag's last fill progress, not from when the attack was
// parked: a commitment bigger than the flag's cap expands the flag
// (fitPendingMusterFlagCapacity) and can take well over 5 minutes to stage at
// MUSTER_BASE_RATE_PER_MIN split across the player's flags, and that wait is
// progress, not a stall.
export const MUSTER_PENDING_STALL_TIMEOUT_MS = 5 * 60 * 1000;

type PendingMusterProgressEntry = {
  targetX: number;
  targetY: number;
  queuedAt?: number;
  progressAt?: number;
  progressAmount?: number;
};

type PendingMusterProgressState = {
  domainIds?: readonly string[];
  attackCommitByTargetKey: Map<string, AttackCommitEntry>;
  tiles: Map<string, Tile>;
};

/**
 * Notes fill progress on the entry's flag and reports whether the entry has
 * gone MUSTER_PENDING_STALL_TIMEOUT_MS without any. While the flag is still
 * filling, the target's chosen commitment is re-stamped so its own TTL
 * (ATTACK_COMMIT_TTL_MS) can't lapse mid-wait and launch the attack with less
 * than the player committed.
 */
export const pendingMusterAttackStalled = (
  state: PendingMusterProgressState,
  entry: PendingMusterProgressEntry,
  flagAmount: number | undefined,
  now = Date.now()
): boolean => {
  if (flagAmount !== undefined && flagAmount > (entry.progressAmount ?? Number.NEGATIVE_INFINITY)) {
    entry.progressAmount = flagAmount;
    entry.progressAt = now;
    const commit = attackCommitForTarget(state, entry.targetX, entry.targetY, now);
    if (commit !== undefined) setAttackCommit(state, entry.targetX, entry.targetY, commit, now);
  }
  const since = entry.progressAt ?? entry.queuedAt;
  return since !== undefined && now - since > MUSTER_PENDING_STALL_TIMEOUT_MS;
};
