import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import { yieldToEventLoop } from "../event-loop-yield.js";
import type { SimulationEventStore } from "../event-store/event-store.js";
import type { SimulationMetrics } from "../metrics/metrics.js";
import type { SimulationRuntime } from "../runtime/runtime.js";
import {
  createSnapshotCheckpointManager,
  type SnapshotCheckpointManager
} from "../snapshot-checkpoint-manager/snapshot-checkpoint-manager.js";
import type { SimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import type { SimulationServiceOptions } from "./simulation-service-options.js";

type CheckpointLog = Pick<Console, "error" | "info" | "warn">;

export type SimulationCheckpointingDeps = {
  eventStore: SimulationEventStore;
  snapshotStore: SimulationSnapshotStore;
  // Getters, not values: the service swaps both on season rollover.
  runtime: () => Pick<SimulationRuntime, "exportSnapshotSectionsAsync" | "replayCacheStats">;
  season: () => SimulationSeasonState;
  metrics: Pick<SimulationMetrics, "setSimCheckpointRssMb" | "observeSimCheckpointExportMs" | "setReplayCacheStats">;
  log: CheckpointLog;
  options: Pick<
    SimulationServiceOptions,
    "checkpointEveryEvents" | "checkpointForceAfterEvents" | "checkpointMaxRssBytes" | "checkpointMaxHeapUsedBytes"
  >;
};

/** The simulation service's snapshot checkpoint manager, with its metrics and phase logging. */
export const createSimulationCheckpointManager = (deps: SimulationCheckpointingDeps): SnapshotCheckpointManager => {
  const { options, metrics, log } = deps;
  let checkpointSaveStartMs = 0;
  return createSnapshotCheckpointManager({
    eventStore: deps.eventStore,
    snapshotStore: deps.snapshotStore,
    exportSnapshotSections: async () => {
      const snapshotSections = await deps.runtime().exportSnapshotSectionsAsync(yieldToEventLoop);
      return {
        ...snapshotSections,
        initialState: {
          ...snapshotSections.initialState,
          season: deps.season()
        }
      };
    },
    checkpointEveryEvents: options.checkpointEveryEvents ?? 5000,
    ...(typeof options.checkpointForceAfterEvents === "number"
      ? { forceCheckpointAfterEvents: options.checkpointForceAfterEvents }
      : {}),
    ...(typeof options.checkpointMaxRssBytes === "number" ? { maxCheckpointRssBytes: options.checkpointMaxRssBytes } : {}),
    ...(typeof options.checkpointMaxHeapUsedBytes === "number"
      ? { maxCheckpointHeapUsedBytes: options.checkpointMaxHeapUsedBytes }
      : {}),
    onCheckpointPhase: ({ phase, pendingEvents, memoryUsage, lastAppliedEventId }) => {
      metrics.setSimCheckpointRssMb(memoryUsage.rssBytes / (1024 * 1024));
      if (phase === "before_save") checkpointSaveStartMs = Date.now();
      if (phase === "after_save" && checkpointSaveStartMs > 0) {
        metrics.observeSimCheckpointExportMs(Date.now() - checkpointSaveStartMs);
        checkpointSaveStartMs = 0;
      }
      // Replay-cache observability: recordedCommandHistorySize is the count of
      // commands whose events embed in this snapshot (previously leaked to 122k);
      // recordedHistoryEvicted>0 means an unforeseen server prefix is leaking past
      // the classification gate and hitting the hard cap.
      const replayCacheStats = phase === "before_save" ? deps.runtime().replayCacheStats() : undefined;
      if (replayCacheStats) metrics.setReplayCacheStats(replayCacheStats);
      log.info(
        {
          phase,
          pendingEvents,
          rssBytes: memoryUsage.rssBytes,
          heapUsedBytes: memoryUsage.heapUsedBytes,
          heapTotalBytes: memoryUsage.heapTotalBytes,
          ...(typeof lastAppliedEventId === "number" ? { lastAppliedEventId } : {}),
          ...(replayCacheStats ? { replayCache: replayCacheStats } : {})
        },
        phase === "skipped_high_memory"
          ? "simulation checkpoint deferred due to memory watermark"
          : "simulation checkpoint phase"
      );
    }
  });
};

/**
 * Saves one last checkpoint on a graceful shutdown (every deploy). Snapshots
 * are the only durable copy of per-player scalars like manpower -- event
 * replay restores tiles but not them -- so without this a restart rolls those
 * back to the last periodic checkpoint: manpower spent since then came back
 * while the territory it bought stayed. Never throws: a failed save must not
 * block the rest of shutdown.
 */
export const saveShutdownCheckpoint = async (manager: SnapshotCheckpointManager, log: CheckpointLog): Promise<void> => {
  const startedAt = Date.now();
  try {
    const result = await manager.checkpointOnShutdown();
    log.info({ checkpointResult: result, durationMs: Date.now() - startedAt }, "simulation shutdown checkpoint");
  } catch (error) {
    log.error({ err: error, durationMs: Date.now() - startedAt }, "simulation shutdown checkpoint failed");
  }
};
