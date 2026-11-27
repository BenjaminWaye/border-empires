// Preload (NODE_OPTIONS="--require <this file>") that makes every thread of
// the stack -- gateway main thread, simulation worker and every nested worker
// -- append its own V8 heap statistics to PROBE_DIR/thread-heaps.jsonl every
// 10 s, and names each worker in thread-names.jsonl. This is how whole-process
// memory is split between threads: each worker has its own heap, which the
// simulation's own heap metric does not include. Local measurement only.
const { appendFileSync, unlinkSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const v8 = require("node:v8");
const { threadId, isMainThread } = require("node:worker_threads");

const dir = process.env.PROBE_DIR;
if (dir) {
  // Name each worker by its entry file: wrap the Worker constructor so the
  // parent logs which script each child thread id runs.
  const workerThreads = require("node:worker_threads");
  const BaseWorker = workerThreads.Worker;
  workerThreads.Worker = class extends BaseWorker {
    constructor(filename, options) {
      super(filename, options);
      try {
        appendFileSync(
          path.join(dir, "thread-names.jsonl"),
          `${JSON.stringify({ threadId: this.threadId, parentThreadId: threadId, entry: path.basename(String(filename)) })}\n`
        );
      } catch {
        // measurement only
      }
    }
  };
  require("node:module").syncBuiltinESMExports();
  const entry = isMainThread ? "main(gateway)" : `worker-${threadId}`;
  const sample = () => {
    const heap = v8.getHeapStatistics();
    try {
      appendFileSync(
        path.join(dir, "thread-heaps.jsonl"),
        `${JSON.stringify({
          at: Date.now(),
          threadId,
          entry,
          usedMb: +(heap.used_heap_size / 1048576).toFixed(1),
          totalMb: +(heap.total_heap_size / 1048576).toFixed(1),
          physicalMb: +(heap.total_physical_size / 1048576).toFixed(1),
          externalMb: +(heap.external_memory / 1048576).toFixed(1),
          mallocedMb: +(heap.malloced_memory / 1048576).toFixed(1),
          ...(isMainThread ? { rssMb: +(process.memoryUsage.rss() / 1048576).toFixed(1) } : {})
        })}\n`
      );
    } catch {
      // measurement must never take the stack down
    }
  };
  setInterval(sample, 10_000).unref();
  // Heap snapshot of one thread on request: `touch $PROBE_DIR/snapshot-request-<threadId>`
  // writes a .heapsnapshot there and then `snapshot-done-<threadId>` with its path.
  // It pauses that thread for about a minute and inflates process memory for
  // the rest of the run, so take it last.
  setInterval(() => {
    try {
      unlinkSync(path.join(dir, `snapshot-request-${threadId}`));
    } catch {
      return;
    }
    const file = v8.writeHeapSnapshot(path.join(dir, `thread-${threadId}-${Date.now()}.heapsnapshot`));
    writeFileSync(path.join(dir, `snapshot-done-${threadId}`), `${file}\n`);
  }, 2_000).unref();
}
