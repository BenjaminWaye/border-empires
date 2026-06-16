// Worker-thread entry for the simulation service. Spawned by apps/realtime-
// gateway/src/main-merged.ts so heavy sim compute (snapshot
// writes, etc.) runs on an isolated event loop and can never block the
// gateway's /healthz or WebSocket upgrades.
//
// Service setup is shared with the standalone entry (apps/simulation/src/
// main.ts) via bootstrapSimulationProcess(); this file only wires the
// MessagePort lifecycle protocol with the parent thread.
//
// Message protocol (parent → worker):
//   { type: "shutdown", reason?: string }
//
// Message protocol (worker → parent):
//   { type: "ready", grpcAddress, metricsHost, metricsPort }
//   { type: "closed" }
//   { type: "fatal", reason, error }
//   { type: "diag_buffer", entries: LagDiagEntry[] }   (periodic, ≤1 Hz)
//
// Per-request gateway↔sim traffic never crosses this MessagePort — it goes
// over the loopback gRPC socket the worker binds inside bootstrap. Only
// lifecycle events flow here.

import { parentPort } from "node:worker_threads";
import { bootstrapSimulationProcess } from "./process-bootstrap.js";

if (!parentPort) {
  throw new Error("worker-main must run inside a worker_threads Worker");
}
const port = parentPort;

const { service, runtimeEnv, binding, beginShutdown } = await bootstrapSimulationProcess({
  onClosed: () => port.postMessage({ type: "closed" }),
  onFatal: (reason, error) => port.postMessage({ type: "fatal", reason, error })
});

console.info(
  {
    grpcAddress: binding.address,
    metricsAddress: `${runtimeEnv.metricsHost}:${runtimeEnv.metricsPort}`,
    healthProbeIntervalMs: runtimeEnv.healthProbeIntervalMs,
    healthProbeTimeoutMs: runtimeEnv.healthProbeTimeoutMs,
    healthFailureThreshold: runtimeEnv.healthFailureThreshold
  },
  "simulation worker listeners ready"
);

port.postMessage({
  type: "ready",
  grpcAddress: binding.address,
  metricsHost: runtimeEnv.metricsHost,
  metricsPort: runtimeEnv.metricsPort
});

// Periodically forward the lag-diagnostic ring buffer to the parent (gateway
// main thread) so both death-write paths (watchdog kill + sim-exit handler)
// have the sim's last known state. ≤1 Hz keeps the inter-thread payload tiny.
const diagBufferInterval = setInterval(() => {
  const entries = service.lagDiagSnapshot();
  port.postMessage({ type: "diag_buffer", entries });
}, 1_000);
diagBufferInterval.unref();

port.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;
  if (message.type === "shutdown") {
    clearInterval(diagBufferInterval);
    const reason = typeof message.reason === "string" ? message.reason : "parent_shutdown";
    void beginShutdown(reason);
  }
});

process.once("uncaughtException", (error) => {
  console.error({ err: error }, "simulation worker uncaught exception");
  process.exitCode = 1;
  void beginShutdown("uncaughtException");
});
process.once("unhandledRejection", (reason) => {
  console.error({ err: reason }, "simulation worker unhandled rejection");
  process.exitCode = 1;
  void beginShutdown("unhandledRejection");
});
