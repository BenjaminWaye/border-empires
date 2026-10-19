import type { LockRecord } from "./runtime-types.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

export function tickOrphanedLockSweep(input: {
  nowMs: number;
  orphanLockGraceMs: number;
  locksByTile: CombatLockIndex;
  locksByCommandId: Map<string, LockRecord>;
  // EXPAND charges its manpower cost up front at lock creation (runtime-
  // frontier-command.ts), so an orphaned EXPAND lock swept here without ever
  // resolving has to hand it back.
  refundExpandManpower: (playerId: string, amount: number) => void;
}): number {
  const cutoff = input.nowMs - input.orphanLockGraceMs;
  const droppedCommandIds = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    if (lock.resolvesAt >= cutoff) continue;
    input.locksByTile.removeLock(lock);
    input.locksByCommandId.delete(lock.commandId);
    if (lock.actionType === "EXPAND") input.refundExpandManpower(lock.playerId, lock.manpowerCost);
    droppedCommandIds.add(lock.commandId);
  }
  return droppedCommandIds.size;
}
