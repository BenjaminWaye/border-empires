import type { QueueLane } from "./command-lane/command-lane.js";

/**
 * Pure helpers for the runtime's per-lane job queue depth/backlog gauges.
 * Extracted from runtime.ts (see queueDepths/queueBacklogMs) so the
 * always-over-cap runtime.ts file can call one-line delegates instead of
 * carrying the full computation inline.
 */
export const computeQueueDepths = (
  jobsByLane: Record<QueueLane, { enqueuedAt: number }[]>
): Record<QueueLane, number> => ({
  human_interactive: jobsByLane.human_interactive.length,
  human_noninteractive: jobsByLane.human_noninteractive.length,
  system: jobsByLane.system.length,
  ai: jobsByLane.ai.length
});

export const computeQueueBacklogMs = (
  jobsByLane: Record<QueueLane, { enqueuedAt: number }[]>,
  nowMs: number
): Record<QueueLane, number> => {
  const backlogFor = (lane: QueueLane): number => {
    const oldest = jobsByLane[lane][0];
    if (!oldest) return 0;
    return Math.max(0, nowMs - oldest.enqueuedAt);
  };
  return {
    human_interactive: backlogFor("human_interactive"),
    human_noninteractive: backlogFor("human_noninteractive"),
    system: backlogFor("system"),
    ai: backlogFor("ai")
  };
};
