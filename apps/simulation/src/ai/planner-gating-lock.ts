import type { LockRecord } from "../runtime-types.js";

// No allocation in the direct planner's per-player gating check. Automation
// locks do not freeze AI decisions; player-issued locks still do.
export function hasPlannerGatingLock(locks: Iterable<Pick<LockRecord, "playerId" | "source">>, playerId: string): boolean {
  for (const lock of locks) {
    if (lock.playerId === playerId && lock.source !== "automation") return true;
  }
  return false;
}
