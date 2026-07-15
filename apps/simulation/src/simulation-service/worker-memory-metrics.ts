import type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";

type HasWorkerMetrics = { getWorkerMetrics: () => WorkerMemoryMetrics };

const hasWorkerMetrics = (value: unknown): value is HasWorkerMetrics =>
  Boolean(value) && typeof value === "object" && "getWorkerMetrics" in (value as object);

const shapeMetrics = (metrics: WorkerMemoryMetrics | undefined, toMb: (bytes?: number) => number | undefined) =>
  metrics
    ? {
        heap_used_mb: toMb(metrics.heapUsedBytes),
        external_mb: toMb(metrics.externalBytes),
        array_buffers_mb: toMb(metrics.arrayBuffersBytes),
        respawn_count: metrics.respawnCount,
        last_exit_code: metrics.lastExitCode
      }
    : undefined;

/**
 * Builds the `sim_worker_memory` field logged periodically by
 * simulation-service.ts. Extracted so wiring in a new worker pool (e.g. the
 * snapshot-compaction worker) doesn't require growing that already-oversized
 * file — add the new handle to this function's params instead.
 *
 * Per-worker rss is intentionally dropped — process.memoryUsage().rss inside
 * a Worker returns the shared-process RSS, not the worker's own contribution.
 * Heap, external, and arrayBuffers are per-V8-isolate (per-worker) and useful.
 */
export const buildWorkerMemoryMetricsLog = (deps: {
  snapshotStringifier?: unknown;
  snapshotCompactor?: unknown;
  snapshotBuildPool?: { getMetrics: () => WorkerMemoryMetrics[] } | undefined;
  aiCommandProducer?: unknown;
  systemCommandProducer?: unknown;
}) => {
  const toMb = (bytes?: number): number | undefined =>
    typeof bytes === "number" ? Math.round((bytes / (1024 * 1024)) * 10) / 10 : undefined;

  const snapshotMetrics = hasWorkerMetrics(deps.snapshotStringifier) ? deps.snapshotStringifier.getWorkerMetrics() : undefined;
  const compactionMetrics = hasWorkerMetrics(deps.snapshotCompactor) ? deps.snapshotCompactor.getWorkerMetrics() : undefined;
  const buildWorkerMetrics = deps.snapshotBuildPool?.getMetrics();
  const aiMetrics = hasWorkerMetrics(deps.aiCommandProducer) ? deps.aiCommandProducer.getWorkerMetrics() : undefined;
  const systemMetrics = hasWorkerMetrics(deps.systemCommandProducer) ? deps.systemCommandProducer.getWorkerMetrics() : undefined;

  return {
    snapshot: shapeMetrics(snapshotMetrics, toMb),
    compaction: shapeMetrics(compactionMetrics, toMb),
    build_workers: buildWorkerMetrics?.map((m, i) => ({
      slot: i,
      heap_used_mb: toMb(m.heapUsedBytes),
      respawn_count: m.respawnCount,
      last_exit_code: m.lastExitCode
    })),
    ai: shapeMetrics(aiMetrics, toMb),
    system: shapeMetrics(systemMetrics, toMb)
  };
};
