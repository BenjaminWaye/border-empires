import type { LockRecord } from "./runtime-types.js";

/** The subset of {@link RuntimeLockResolutionContext} applyCombatEncirclement needs. */
export type RuntimeLockResolutionEncirclementContext = {
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number; skipCutOff?: boolean; claimantId?: string; deferEliminationCheck?: boolean }) => void;
  applyEncirclementForExpand: (targetKey: string, playerId: string, commandId: string, options?: { bfsCap?: number }) => void;
  /** Settled tiles of `ownerId` this resolution's capture unsettled (unsettle-encirclement.ts). */
  takeUnsettledTileKeys?: (ownerId: string) => string[];
};

export function applyCombatEncirclement(
  context: RuntimeLockResolutionEncirclementContext,
  lock: LockRecord,
  attackerWon: boolean,
  originLost: boolean,
  previousOwnerId: string | undefined
): void {
  if (lock.actionType === "ATTACK") {
    const encirclementChangedKeys: string[] = [];
    if (attackerWon) encirclementChangedKeys.push(lock.targetKey);
    if (originLost) encirclementChangedKeys.push(lock.originKey);
    if (encirclementChangedKeys.length === 0) return;
    const affectedPlayerIds = new Set<string>();
    if (attackerWon && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
    if (originLost) affectedPlayerIds.add(lock.playerId);
    if (originLost && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
    for (const pid of affectedPlayerIds) {
      // Planetary Defense land is supplied per camp (planetary-defense-camps/camp-supply.ts):
      // whatever this fight cut off from its camp collapses to neutral there. The
      // House-wide pass would walk every touching camp's land (bfsCap) for nothing.
      if (pid.startsWith("barbarian-")) continue;
      // Frontier cut off by this fight goes to the side that made the cut:
      // the attacker when the defender lost the target, the defender when
      // the attacker lost their origin (see encirclement-pocket-capture.ts).
      // The side that gained a tile has nothing cut off by it: no claimant.
      const claimantId =
        attackerWon && pid === previousOwnerId ? lock.playerId
        : originLost && pid === lock.playerId ? previousOwnerId
        : undefined;
      // A won capture drops the loser's settled land in the target's reach
      // to FRONTIER (the reach "unsettle"); tiles beyond the target's own
      // ring would otherwise never be seeded, so check them here too.
      const unsettledKeys = attackerWon && pid === previousOwnerId ? (context.takeUnsettledTileKeys?.(pid) ?? []) : [];
      const changedKeys = unsettledKeys.length > 0 ? [...encirclementChangedKeys, ...unsettledKeys] : encirclementChangedKeys;
      context.applyEncirclement(changedKeys, pid, lock.commandId, {
        bfsCap: 2000,
        deferEliminationCheck: true, // resolveLock calls respawnIfEliminated itself
        ...(claimantId ? { claimantId } : {})
      });
    }
  } else if (lock.actionType === "EXPAND" && attackerWon) {
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId, { bfsCap: 2000 });
  }
}
