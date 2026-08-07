import type { LagDiagEntry } from "../lag-diagnostics.js";
import type { MainThreadTaskSnapshot } from "../main-thread-task-tracker/main-thread-task-tracker.js";
import { computeRssHeapGapMb } from "../mem-gap-diagnostic/mem-gap-diagnostic.js";

// Prior event_loop_blocked incidents (see docs referenced in
// main-thread-task-tracker.ts / event-loop-yield.ts) repeatedly showed empty
// or sparse `mainThreadTasks` during real multi-second stalls because the
// culprit was GC pausing JS execution, not tracked synchronous JS work. GC
// pauses were logged separately (gc_pause_detected) with no way to tell
// whether one landed inside a given block window. This module attaches any
// GC pauses recorded during the stalled window directly onto the
// event_loop_blocked payload, and surfaces the RSS/heap gap (native/external
// memory not visible in heapUsedMb) so GC-thrash vs. tracked-JS-work can be
// told apart from a single log line instead of manual timestamp correlation.
const MAIN_THREAD_TASK_LIMIT = 16;

export type EventLoopBlockedParams = {
  lagMs: number;
  detectedAtMs: number;
  blockStartedAtMs: number;
  queueDepths: Record<string, number>;
  memory: NodeJS.MemoryUsage;
  persistencePendingCount: number;
  persistenceDegraded: boolean;
  activePlayerCount: number;
  mainThreadTasks: MainThreadTaskSnapshot[];
  lagDiagRing: LagDiagEntry[];
};

const taskWeight = (task: MainThreadTaskSnapshot): number => (task.active ? task.elapsedMs : task.durationMs);

export const buildEventLoopBlockedPayload = (params: EventLoopBlockedParams): Record<string, unknown> => {
  const { memory } = params;
  const gcPausesDuringBlock = params.lagDiagRing
    .filter((entry) => entry.event === "gc_pause_detected" && entry.at >= params.blockStartedAtMs && entry.at <= params.detectedAtMs)
    .map((entry) => ({ at: entry.at, durationMs: entry.durationMs, gcKind: entry.gcKind }));
  return {
    phase: "event_loop_blocked",
    lagMs: params.lagMs,
    detectedAtMs: params.detectedAtMs,
    blockStartedAtMs: params.blockStartedAtMs,
    queueDepths: params.queueDepths,
    heapUsedMb: memory.heapUsed / (1024 * 1024),
    heapTotalMb: memory.heapTotal / (1024 * 1024),
    rssMb: memory.rss / (1024 * 1024),
    rssHeapGapMb: computeRssHeapGapMb(memory),
    persistencePendingCount: params.persistencePendingCount,
    persistenceDegraded: params.persistenceDegraded,
    activePlayerCount: params.activePlayerCount,
    mainThreadTasks: params.mainThreadTasks.slice().sort((a, b) => taskWeight(b) - taskWeight(a)).slice(0, MAIN_THREAD_TASK_LIMIT),
    gcPausesDuringBlock
  };
};
