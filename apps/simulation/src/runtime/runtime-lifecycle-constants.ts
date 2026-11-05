// Runtime-lifecycle tuning constants used by SimulationRuntime's respawn and
// lock-sweep wiring (moved out of runtime.ts to keep that file under its cap).

// §24.2: revised down from 100 to 10 (one tier-1 tech's worth, §13) — in
// line with how far everything else in the new economy scale shrank.
export const RESPAWN_MINIMUM_GOLD = 10;
// Grace beyond resolvesAt before the sweep drops a lock (60s).
// Normal locks resolve inside their setTimeout window; anything still present
// is a leak from a code path that bypassed validation.
export const ORPHAN_LOCK_GRACE_MS = 60_000;
