import type { LockRecord } from "./runtime-types.js";

/** The subset of {@link RuntimeLockResolutionContext} applyCombatEncirclement needs. */
export type RuntimeLockResolutionEncirclementContext = {
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number; skipCutOff?: boolean }) => void;
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
      context.applyEncirclement(encirclementChangedKeys, pid, lock.commandId, { bfsCap: 2000 });
    }
  } else if (lock.actionType === "EXPAND" && attackerWon) {
    context.applyEncirclementForExpand(lock.targetKey, lock.playerId, lock.commandId, { bfsCap: 2000 });
  }
}
