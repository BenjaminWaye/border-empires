export type WorkerMemoryMetrics = {
  // `rssBytes` is the *process-wide* RSS as seen from inside the worker
  // thread — workers share the address space, so this isn't per-worker memory.
  // Kept for parity but intentionally not exposed in the per-worker log block.
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  externalBytes?: number;
  arrayBuffersBytes?: number;
  respawnCount: number;
  lastExitCode?: number;
  lastExitAt?: number;
};
