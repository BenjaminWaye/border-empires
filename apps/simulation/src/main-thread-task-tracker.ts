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

export type MainThreadTaskTracker = {
  trackSync<T>(phase: string, details: MainThreadTaskDetails | undefined, task: () => T): T;
  recentSince(startedAtMs: number, endedAtMs?: number): MainThreadTaskSnapshot[];
};

export const createMainThreadTaskTracker = (options: {
  now?: () => number;
  maxEntries?: number;
  minRetainedDurationMs?: number;
} = {}): MainThreadTaskTracker => {
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
      try {
        return task();
      } finally {
        const endedAtMs = now();
        const durationMs = Math.max(0, endedAtMs - startedAtMs);
        active = previousActive;
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
