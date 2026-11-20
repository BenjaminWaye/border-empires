import type { LockRecord } from "./runtime-types.js";

/** The subset of {@link RuntimeLockResolutionContext} applyCombatEncirclement needs. */
export type RuntimeLockResolutionEncirclementContext = {
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number; skipCutOff?: boolean; claimantId?: string }) => void;
  applyEncirclementForExpand: (targetKey: string, playerId: string, commandId: string, options?: { bfsCap?: number }) => void;
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
      context.applyEncirclement(encirclementChangedKeys, pid, lock.commandId, {
        bfsCap: 2000,
        ...(claimantId ? { claimantId } : {})
      });
    }
  } else if (lock.actionType === "EXPAND" && attackerWon) {
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId, { bfsCap: 2000 });
  }
}
