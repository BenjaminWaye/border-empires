import { clampMetric } from "./metrics-format.js";

export type ReplayCacheMetricsSnapshot = {
  simReplayRecordedCommandHistory: number;
  simReplayHistoryEvictedTotal: number;
  simReplayServerEventsSkippedTotal: number;
};

// Scalars sampled from RuntimeReplayCache.stats() at each checkpoint save.
export const createReplayCacheMetrics = () => {
  let simReplayRecordedCommandHistory = 0;
  let simReplayHistoryEvictedTotal = 0;
  let simReplayServerEventsSkippedTotal = 0;

  return {
    set: (stats: { recordedCommandHistorySize: number; recordedHistoryEvicted: number; serverEventsSkipped: number }): void => {
      simReplayRecordedCommandHistory = clampMetric(stats.recordedCommandHistorySize);
      simReplayHistoryEvictedTotal = clampMetric(stats.recordedHistoryEvicted);
      simReplayServerEventsSkippedTotal = clampMetric(stats.serverEventsSkipped);
    },
    snapshot: (): ReplayCacheMetricsSnapshot => ({
      simReplayRecordedCommandHistory,
      simReplayHistoryEvictedTotal,
      simReplayServerEventsSkippedTotal
    })
  };
};
