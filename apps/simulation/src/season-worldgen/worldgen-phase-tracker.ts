/**
 * Wraps one synchronous worldgen stage so the simulation's main-thread task
 * tracker can attribute it. Season rollover runs worldgen on the simulation
 * main thread between cooperative yields; before these phases were named, an
 * event_loop_blocked during a rollover listed no mainThreadTasks at all (prod
 * 2026-11-28: a 12s block with only unrelated 1-40ms AI tasks attributed).
 * The phase name is prefixed with `worldgen_`; untracked callers (boot-time
 * baseline regeneration, tests) pass nothing and pay nothing.
 */
export type WorldgenPhaseTracker = <T>(phase: string, task: () => T) => T;

export const untrackedWorldgenPhase: WorldgenPhaseTracker = (_phase, task) => task();
