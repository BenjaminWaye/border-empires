/**
 * Combined AI + system-job worker thread (P3 of the checkpoint-contention
 * fallback plan — see project memory "Checkpoint contention P2/P3 fallback
 * plans").
 *
 * On a single shared-cpu-1x Fly.io vCPU, every additional OS thread is more
 * contention for the one physical core (proven via /proc/pressure/cpu in
 * PR #948). This worker hosts BOTH producers' planning logic in a single
 * Worker thread instead of two, cutting one concurrently-scheduled OS thread.
 *
 * The two producers remain logically independent: this file does nothing
 * but demux incoming messages by a `channel: "ai" | "system"` tag to the
 * corresponding core (ai-planner-worker-core.ts / system-job-worker-core.ts,
 * the SAME modules the standalone ai-planner-worker.ts / system-job-worker.ts
 * entry points use), and tag outgoing messages with the same channel so the
 * main-thread host (combined-worker-host.ts) can route replies back to the
 * right producer. Each core keeps its own independent state (tile cache,
 * player cache, pause flag, etc.) — nothing about AI decision-making,
 * barbarian logic, or scheduling cadence changes here.
 *
 * Message protocol (main → worker): as ai-planner-worker.ts /
 * system-job-worker.ts, with every message additionally carrying
 * `channel: "ai" | "system"`. A `{ type: "shutdown" }` message is NOT
 * channel-scoped — either channel closing does NOT exit this process (the
 * other channel may still be live); only combined-worker-host.ts's own
 * close() sends the unscoped shutdown that flushes both cores and exits.
 *
 * Message protocol (worker → main): as the standalone workers, each message
 * additionally carrying the same `channel` tag it was routed under.
 */

import { parentPort } from "node:worker_threads";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import { createSystemJobWorkerCore } from "./system-job-worker-core.js";

if (!parentPort) throw new Error("combined-producer-worker must run inside a Worker thread");

const aiCore = createAiPlannerWorkerCore((msg) => parentPort!.postMessage({ ...msg, channel: "ai" }));
const systemCore = createSystemJobWorkerCore((msg) => parentPort!.postMessage({ ...msg, channel: "system" }));

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;

  // Process-level shutdown: flush both cores, then exit once. Not tied to
  // either individual channel — the host only sends this when BOTH
  // producers have released the shared worker.
  if (message.type === "shutdown" && message.channel === undefined) {
    void Promise.all([aiCore.shutdown(), systemCore.shutdown()]).finally(() => {
      process.exit(0);
    });
    return;
  }

  if (message.channel === "ai") {
    aiCore.handleMessage(message);
  } else if (message.channel === "system") {
    systemCore.handleMessage(message);
  }
});

parentPort.postMessage({ type: "ready", channel: "ai" });
parentPort.postMessage({ type: "ready", channel: "system" });

// Single shared process — one memoryUsage() sample describes both channels'
// footprint. Emit it twice (once per channel tag) so each main-thread
// producer's existing per-channel workerMetrics tracking keeps working
// unmodified.
const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  parentPort!.postMessage({ type: "metrics", memoryUsage, channel: "ai" });
  parentPort!.postMessage({ type: "metrics", memoryUsage, channel: "system" });
}, METRICS_INTERVAL_MS).unref();
