type TaskDetailValue = string | number | boolean | null;

export type MainThreadTaskDetails = Record<string, TaskDetailValue>;

export type MainThreadTaskSnapshot = {
  phase: string;
  startedAtMs: number;
  details?: MainThreadTaskDetails;
} & (
  | {
      active: true;
      elapsedMs: number;
    }
  | {
      active: false;
      endedAtMs: number;
      durationMs: number;
    }
);

export type ActiveMainThreadTask = {
  phase: string;
  startedAtMs: number;
  details?: MainThreadTaskDetails;
};

export type MainThreadTaskTracker = {
  trackSync<T>(phase: string, details: MainThreadTaskDetails | undefined, task: () => T): T;
  recentSince(startedAtMs: number, endedAtMs?: number): MainThreadTaskSnapshot[];
};

export type MainThreadTaskTrackerOptions = {
  now?: () => number;
  maxEntries?: number;
  minRetainedDurationMs?: number;
  // Fired synchronously every time the current top-of-stack task changes --
  // on start (with the new task) and on end (with whatever task, if any,
  // trackSync calls nest, this always reflects the true top of stack: an
  // inner call's own end fires with the OUTER task, not undefined, so a
  // caller mirroring this into "what's active right now" never reports empty
  // while an outer phase is still running. Unlike a periodic sampler, this
  // can never miss a task that blocks the event loop for its entire duration
  // (nothing else gets a turn to run while it's in flight, including a
  // setInterval-based poller) -- callers use it to hand the in-flight phase
  // off-thread (e.g. postMessage to a parent thread) the moment it starts,
  // so a SIGKILL mid-stall still has a last-known "this is what was running"
  // fact instead of only post-hoc completed durations.
  onActiveTaskChanged?: (task: ActiveMainThreadTask | undefined) => void;
};

export const createMainThreadTaskTracker = (options: MainThreadTaskTrackerOptions = {}): MainThreadTaskTracker => {
  const now = options.now ?? (() => Date.now());
  const maxEntries = Math.max(1, options.maxEntries ?? 32);
  const minRetainedDurationMs = Math.max(0, options.minRetainedDurationMs ?? 10);
  const completed: MainThreadTaskSnapshot[] = [];
  let active:
    | {
        phase: string;
        startedAtMs: number;
        details?: MainThreadTaskDetails;
      }
    | undefined;

  const retain = (snapshot: MainThreadTaskSnapshot): void => {
    completed.push(snapshot);
    while (completed.length > maxEntries) completed.shift();
  };

  return {
    trackSync<T>(phase: string, details: MainThreadTaskDetails | undefined, task: () => T): T {
      const previousActive = active;
      const startedAtMs = now();
      active = {
        phase,
        startedAtMs,
        ...(details ? { details } : {})
      };
      options.onActiveTaskChanged?.(active);
      try {
        return task();
      } finally {
        const endedAtMs = now();
        const durationMs = Math.max(0, endedAtMs - startedAtMs);
        active = previousActive;
        options.onActiveTaskChanged?.(active);
        if (durationMs >= minRetainedDurationMs) {
          retain({
            phase,
            startedAtMs,
            endedAtMs,
            durationMs,
            active: false,
            ...(details ? { details } : {})
          });
        }
      }
    },
    recentSince(startedAtMs: number, endedAtMs: number = now()): MainThreadTaskSnapshot[] {
      const snapshots = completed.filter((task) => {
        if (task.active) return task.startedAtMs <= endedAtMs;
        return task.endedAtMs >= startedAtMs && task.startedAtMs <= endedAtMs;
      });
      if (active && active.startedAtMs <= endedAtMs) {
        snapshots.push({
          phase: active.phase,
          startedAtMs: active.startedAtMs,
          elapsedMs: Math.max(0, endedAtMs - active.startedAtMs),
          active: true,
          ...(active.details ? { details: active.details } : {})
        });
      }
      return snapshots;
    }
  };
};

// Per-player tick phases (tile shedding, territory automation, passive income)
// are individually sub-10ms but add up across 25 players; the createMainThreadTaskTracker
// default 10ms retention threshold and 32-entry ring buffer would drop or evict
// every one of them before the event_loop_blocked check reads them.
export const createMainThreadTaskTrackerFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
  callbacks: Pick<MainThreadTaskTrackerOptions, "onActiveTaskChanged"> = {}
): MainThreadTaskTracker =>
  createMainThreadTaskTracker({
    minRetainedDurationMs: Math.max(0, Number(env.SIMULATION_MAIN_THREAD_TASK_MIN_MS ?? 1)),
    maxEntries: Math.max(1, Number(env.SIMULATION_MAIN_THREAD_TASK_MAX_ENTRIES ?? 256)),
    ...callbacks
  });
