import type { SimulationEventStore } from "./event-store.js";
import type { SimulationSnapshotSections, SimulationSnapshotStore } from "./snapshot-store.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

export type SnapshotCheckpointMemoryUsage = {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
};

export type SnapshotCheckpointPhase =
  | "before_load"
  | "after_load"
  | "skipped_high_memory"
  | "before_save"
  | "after_save";

type SnapshotCheckpointManagerOptions = {
  eventStore: SimulationEventStore;
  snapshotStore: SimulationSnapshotStore;
  exportSnapshotSections: () => SimulationSnapshotSections;
  /** When provided, projection tables are written at each checkpoint. */
  exportProjectionState?: () => ProjectionExportState;
  checkpointEveryEvents?: number;
  now?: () => number;
  getMemoryUsage?: () => SnapshotCheckpointMemoryUsage;
  maxCheckpointRssBytes?: number;
  maxCheckpointHeapUsedBytes?: number;
  checkpointFailureBackoffEvents?: number;
  onCheckpointPhase?: (sample: {
    phase: SnapshotCheckpointPhase;
    pendingEvents: number;
    memoryUsage: SnapshotCheckpointMemoryUsage;
    lastAppliedEventId?: number;
  }) => void;
};

export type SnapshotCheckpointManager = {
  onEventPersisted: () => Promise<void>;
};

export const createSnapshotCheckpointManager = (
  options: SnapshotCheckpointManagerOptions
): SnapshotCheckpointManager => {
  const checkpointEveryEvents = Math.max(1, options.checkpointEveryEvents ?? 5000);
  const checkpointFailureBackoffEvents = Math.max(1, options.checkpointFailureBackoffEvents ?? checkpointEveryEvents);
  const now = options.now ?? (() => Date.now());
  const getMemoryUsage =
    options.getMemoryUsage ??
    (() => {
      const usage = process.memoryUsage();
      return {
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
        heapTotalBytes: usage.heapTotal
      };
    });
  const emitPhase = (phase: SnapshotCheckpointPhase, lastAppliedEventId?: number): void => {
    options.onCheckpointPhase?.({
      phase,
      pendingEvents,
      memoryUsage: getMemoryUsage(),
      ...(typeof lastAppliedEventId === "number" ? { lastAppliedEventId } : {})
    });
  };
  const isCheckpointMemoryHot = (): boolean => {
    const usage = getMemoryUsage();
    if (
      typeof options.maxCheckpointRssBytes === "number" &&
      options.maxCheckpointRssBytes > 0 &&
      usage.rssBytes >= options.maxCheckpointRssBytes
    ) {
      return true;
    }
    if (
      typeof options.maxCheckpointHeapUsedBytes === "number" &&
      options.maxCheckpointHeapUsedBytes > 0 &&
      usage.heapUsedBytes >= options.maxCheckpointHeapUsedBytes
    ) {
      return true;
    }
    return false;
  };
  let pendingEvents = 0;
  let snapshotInFlight = false;
  let nextCheckpointPendingEvents = checkpointEveryEvents;

  const flushSnapshot = async (): Promise<void> => {
    if (snapshotInFlight || pendingEvents < nextCheckpointPendingEvents) return;
    if (isCheckpointMemoryHot()) {
      emitPhase("skipped_high_memory");
      nextCheckpointPendingEvents = pendingEvents + checkpointEveryEvents;
      return;
    }

    emitPhase("before_load");
    snapshotInFlight = true;
    try {
      const lastAppliedEventId = await options.eventStore.loadLatestEventId();
      emitPhase("after_load", lastAppliedEventId);
      if (lastAppliedEventId === 0) {
        pendingEvents = 0;
        nextCheckpointPendingEvents = checkpointEveryEvents;
        return;
      }

      emitPhase("before_save", lastAppliedEventId);
      const snapshotSections = options.exportSnapshotSections();
      const projectionState = options.exportProjectionState?.();
      await options.snapshotStore.saveSnapshot({
        lastAppliedEventId,
        snapshotSections,
        createdAt: now(),
        ...(projectionState ? { projectionState } : {})
      });
      emitPhase("after_save", lastAppliedEventId);
      pendingEvents = 0;
      nextCheckpointPendingEvents = checkpointEveryEvents;
    } catch (error) {
      nextCheckpointPendingEvents = pendingEvents + checkpointFailureBackoffEvents;
      throw error;
    } finally {
      snapshotInFlight = false;
    }
  };

  return {
    async onEventPersisted(): Promise<void> {
      pendingEvents += 1;
      await flushSnapshot();
    }
  };
};
