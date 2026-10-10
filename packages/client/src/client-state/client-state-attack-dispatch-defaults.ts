import type { AttackCommitEntry } from "../client-attack-commit/client-attack-commit.js";
import type { DeferredMusterAttack, MusterTransitEntry } from "../client-muster-transit/client-muster-transit.js";

/**
 * Bookkeeping for this client's own outgoing manual attacks, extracted out of
 * client-state.ts (already over the file-line cap) so new fields don't grow it.
 */
export const createInitialAttackDispatchState = () => ({
  // Keyed by the muster flag's own tile key (`${x},${y}`) so independent
  // flags can arm, march, and fire concurrently. See client-muster-transit.ts.
  musterTransitByTile: new Map<string, MusterTransitEntry>(),
  deferredAttackByTile: new Map<string, DeferredMusterAttack>(),
  // Keyed by target tile key: the effort level (commitManpower) the player
  // picked in the Launch Attack / Expand To & Attack dialog, read at every
  // ATTACK send point. Size- and TTL-bounded; see client-attack-commit.ts.
  attackCommitByTargetKey: new Map<string, AttackCommitEntry>()
});
