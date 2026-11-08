import type { AttackCommitEntry } from "../client-attack-commit/client-attack-commit.js";
import type { DetachedAttack } from "../client-detached-attacks/client-detached-attacks.js";
import type { DeferredMusterAttack, MusterTransitEntry } from "../client-muster-transit/client-muster-transit.js";

/**
 * Bookkeeping for this client's own outgoing manual attacks, extracted out of
 * client-state.ts (already over the file-line cap) so new fields don't grow it.
 */
export const createInitialAttackDispatchState = () => ({
  // Keyed by each attack's commandId so one flag can fund several attacks
  // and many flags can arm, march and fire concurrently. See
  // client-muster-transit.ts.
  musterTransitByCommand: new Map<string, MusterTransitEntry>(),
  deferredAttackByCommand: new Map<string, DeferredMusterAttack>(),
  // Attacks the server has locked that no longer hold the single dispatch
  // slot, keyed by commandId, so any number can resolve at once. Bounded;
  // see client-detached-attacks.ts.
  detachedAttacksByCommandId: new Map<string, DetachedAttack>(),
  // Keyed by target tile key: the effort level (commitManpower) the player
  // picked in the Launch Attack dialog, read at every
  // ATTACK send point. Size- and TTL-bounded; see client-attack-commit.ts.
  attackCommitByTargetKey: new Map<string, AttackCommitEntry>()
});
