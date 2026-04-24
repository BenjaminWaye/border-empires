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
  forceCheckpointAfterEvents?: number;
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
  checkpointNow: (options?: { ignoreMemoryGuard?: boolean }) => Promise<SnapshotCheckpointResult>;
};

export type SnapshotCheckpointResult =
  | "saved"
  | "skipped_in_flight"
  | "skipped_threshold"
  | "skipped_high_memory"
  | "skipped_no_events";

export const createSnapshotCheckpointManager = (
  options: SnapshotCheckpointManagerOptions
): SnapshotCheckpointManager => {
  const checkpointEveryEvents = Math.max(1, options.checkpointEveryEvents ?? 5000);
  const forceCheckpointAfterEvents = Math.max(
    checkpointEveryEvents,
    options.forceCheckpointAfterEvents ?? Number.POSITIVE_INFINITY
  );
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

  const flushSnapshot = async ({
    force = false,
    ignoreMemoryGuard = false
  }: {
    force?: boolean;
    ignoreMemoryGuard?: boolean;
  } = {}): Promise<SnapshotCheckpointResult> => {
    if (snapshotInFlight) return "skipped_in_flight";
    const forcedByPendingTail = pendingEvents >= forceCheckpointAfterEvents;
    if (!force && !forcedByPendingTail && pendingEvents < nextCheckpointPendingEvents) {
      return "skipped_threshold";
    }
    if (!ignoreMemoryGuard && !forcedByPendingTail && isCheckpointMemoryHot()) {
      emitPhase("skipped_high_memory");
      if (!force) nextCheckpointPendingEvents = pendingEvents + checkpointEveryEvents;
      return "skipped_high_memory";
    }

    emitPhase("before_load");
    snapshotInFlight = true;
    try {
      const lastAppliedEventId = await options.eventStore.loadLatestEventId();
      emitPhase("after_load", lastAppliedEventId);
      if (lastAppliedEventId === 0) {
        pendingEvents = 0;
        nextCheckpointPendingEvents = checkpointEveryEvents;
        return "skipped_no_events";
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
      return "saved";
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
    },
    checkpointNow(options = {}): Promise<SnapshotCheckpointResult> {
      return flushSnapshot({ force: true, ignoreMemoryGuard: options.ignoreMemoryGuard ?? false });
    }
  };
};
