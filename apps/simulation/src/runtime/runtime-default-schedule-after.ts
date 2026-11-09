// Default timer policy for SimulationRuntime.scheduleAfter (moved out of
// runtime.ts to keep that file under its line cap).
//
// scheduleAfter(0, ...) previously used setTimeout(0) (Timers phase, before
// Check-phase setImmediate snapshot-build yields), so every yield ate a
// ~200ms AI drain callback first — 22+s login stalls. Fix: setImmediate for
// delay=0 lands drains in the same Check phase, but registered AFTER
// snapshot yields re-arm theirs, so yields always run ahead of drains next
// iteration (~22s → ~500ms). Real-delay timers still use setTimeout.
export const defaultScheduleAfter = (delayMs: number, task: () => void): void =>
  delayMs === 0 ? void setImmediate(task) : void setTimeout(task, delayMs);
