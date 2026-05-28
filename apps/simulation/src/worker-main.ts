// Worker-thread entry for the simulation service. Runs the same simulation
// runtime + gRPC + metrics HTTP stack as apps/simulation/src/main.ts, but
// inside a node:worker_threads Worker spawned by apps/realtime-gateway/src/
// main-merged.ts. The gateway runs in the parent thread; isolating sim work
// here means heavy sim compute (COLLECT_VISIBLE, snapshot writes, etc.) can
// never block the gateway's /healthz or WebSocket upgrades.
//
// Message protocol (parent → worker):
//   { type: "shutdown", reason?: string }
//
// Message protocol (worker → parent):
//   { type: "ready", grpcAddress: string, metricsHost: string, metricsPort: number }
//   { type: "closed" }
//   { type: "fatal", reason: string, error: string }
//
// The worker NEVER returns control to the parent for per-request work. The
// gateway talks to the simulation over the gRPC socket the worker binds, the
// same as it did when sim ran on the main thread. Only lifecycle events
// (ready/closed/fatal) flow over the worker MessagePort.

import { createServer, type Server as HttpServer } from "node:http";
import { parentPort } from "node:worker_threads";
import { createListenerWatchdog } from "./listener-watchdog.js";
import { createSimulationService } from "./simulation-service.js";
import { parseSimulationRuntimeEnv } from "./runtime-env.js";

if (!parentPort) {
  throw new Error("worker-main must run inside a worker_threads Worker");
}
const port = parentPort;

const stripIpv6Brackets = (value: string): string =>
  value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;

const managedRuntime = (() => {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging" || typeof process.env.FLY_APP_NAME === "string";
})();

const preferredRoutableProbeHost = (): string | undefined => {
  const envCandidates = [process.env.FLY_PRIVATE_IP, process.env.PRIVATE_IP]
    .map((value) => (typeof value === "string" ? stripIpv6Brackets(value.trim()) : ""))
    .filter(Boolean);
  return envCandidates[0];
};

const runtimeEnv = parseSimulationRuntimeEnv(process.env);

const service = await createSimulationService({
  host: runtimeEnv.host,
  port: runtimeEnv.port,
  ...(runtimeEnv.sqlitePath ? { sqlitePath: runtimeEnv.sqlitePath } : {}),
  ...(runtimeEnv.snapshotDir ? { snapshotDir: runtimeEnv.snapshotDir } : {}),
  applySchema: runtimeEnv.applySchema,
  checkpointEveryEvents: runtimeEnv.checkpointEveryEvents,
  checkpointForceAfterEvents: runtimeEnv.checkpointForceAfterEvents,
  startupReplayCompactionMinEvents: runtimeEnv.startupReplayCompactionMinEvents,
  ...(typeof runtimeEnv.checkpointMaxRssBytes === "number" ? { checkpointMaxRssBytes: runtimeEnv.checkpointMaxRssBytes } : {}),
  ...(typeof runtimeEnv.checkpointMaxHeapUsedBytes === "number"
    ? { checkpointMaxHeapUsedBytes: runtimeEnv.checkpointMaxHeapUsedBytes }
    : {}),
  seedProfile: runtimeEnv.seedProfile,
  ...(runtimeEnv.rulesetId ? { rulesetId: runtimeEnv.rulesetId } : {}),
  ...(typeof runtimeEnv.aiPlayerCount === "number" ? { aiPlayerCount: runtimeEnv.aiPlayerCount } : {}),
  mapStyle: runtimeEnv.mapStyle,
  enableAiAutopilot: runtimeEnv.enableAiAutopilot,
  aiTickMs: runtimeEnv.aiTickMs,
  aiMaxEventLoopLagMs: runtimeEnv.aiMaxEventLoopLagMs,
  enableSystemAutopilot: runtimeEnv.enableSystemAutopilot,
  systemTickMs: runtimeEnv.systemTickMs,
  globalStatusBroadcastDebounceMs: runtimeEnv.globalStatusBroadcastDebounceMs,
  startupRecoveryTimeoutMs: runtimeEnv.startupRecoveryTimeoutMs,
  allowSeedRecoveryFallback: runtimeEnv.allowSeedRecoveryFallback,
  ...(typeof runtimeEnv.requireDurableStartupState === "boolean"
    ? { requireDurableStartupState: runtimeEnv.requireDurableStartupState }
    : {}),
  useAiWorker: runtimeEnv.useAiWorker,
  ...(runtimeEnv.systemPlayerIds ? { systemPlayerIds: runtimeEnv.systemPlayerIds } : {})
});

const binding = await service.start();
const managedProbeHost = managedRuntime ? preferredRoutableProbeHost() : undefined;

const listenerWatchdog = createListenerWatchdog({
  bindHost: binding.host,
  port: binding.port,
  ...(managedProbeHost ? { probeHost: managedProbeHost } : {}),
  probeIntervalMs: runtimeEnv.healthProbeIntervalMs,
  probeTimeoutMs: runtimeEnv.healthProbeTimeoutMs,
  failureThreshold: runtimeEnv.healthFailureThreshold,
  log: console,
  onUnhealthy: (snapshot) => {
    console.error({ snapshot }, "simulation listener watchdog declared unhealthy; exiting for restart");
    // process.kill on the shared OS pid signals the gateway main thread too;
    // its SIGTERM handler runs the combined shutdown sequence.
    process.exitCode = 1;
    process.kill(process.pid, "SIGTERM");
  }
});
listenerWatchdog.start();

const healthResponse = () => {
  const serviceHealth = service.healthSnapshot();
  const listener = listenerWatchdog.snapshot();
  return {
    statusCode: serviceHealth.ok && listener.ok ? 200 : 503,
    body: {
      ...serviceHealth,
      ok: serviceHealth.ok && listener.ok,
      listener
    }
  };
};

const metricsServer: HttpServer = createServer((request, response) => {
  if (request.url === "/metrics") {
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.end(service.renderMetrics());
    return;
  }
  if (request.url === "/health" || request.url === "/healthz") {
    const health = healthResponse();
    response.statusCode = health.statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify(health.body)}\n`);
    return;
  }
  if (request.url && request.url.startsWith("/debug/players")) {
    const aiOnly = /[?&]ai=(true|1)\b/.test(request.url);
    const players = service.playerDebugSnapshot();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify({ players: aiOnly ? players.filter((p) => p.isAi) : players })}\n`);
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});

await new Promise<void>((resolve, reject) => {
  metricsServer.once("error", reject);
  metricsServer.listen(runtimeEnv.metricsPort, runtimeEnv.metricsHost, () => {
    metricsServer.off("error", reject);
    resolve();
  });
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

let shutdownPromise: Promise<void> | undefined;
const SHUTDOWN_HARD_EXIT_MS = 10_000;

const closeWithMetrics = async (): Promise<void> => {
  listenerWatchdog.stop();
  await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
  await service.close();
};

const beginShutdown = (reason: string, details?: Record<string, unknown>): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  console.info({ reason, ...(details ?? {}) }, "simulation worker shutdown requested");
  const hardExitTimer = setTimeout(() => {
    console.error(
      { reason, hardExitMs: SHUTDOWN_HARD_EXIT_MS },
      "simulation worker shutdown deadline exceeded; force-exiting so Fly can restart the machine"
    );
    process.exit(process.exitCode ?? 1);
  }, SHUTDOWN_HARD_EXIT_MS);
  hardExitTimer.unref();
  shutdownPromise = closeWithMetrics()
    .then(() => {
      clearTimeout(hardExitTimer);
      port.postMessage({ type: "closed" });
      process.exit(process.exitCode ?? 0);
    })
    .catch((error) => {
      clearTimeout(hardExitTimer);
      console.error({ err: error, reason }, "simulation worker shutdown failed");
      port.postMessage({
        type: "fatal",
        reason,
        error: error instanceof Error ? error.message : String(error)
      });
      process.exit(process.exitCode ?? 1);
    });
  return shutdownPromise;
};

port.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;
  if (message.type === "shutdown") {
    const reason = typeof message.reason === "string" ? message.reason : "parent_shutdown";
    void beginShutdown(reason);
  }
});

process.once("uncaughtException", (error) => {
  console.error({ err: error }, "simulation worker uncaught exception");
  process.exitCode = 1;
  port.postMessage({
    type: "fatal",
    reason: "uncaughtException",
    error: error instanceof Error ? error.message : String(error)
  });
  void beginShutdown("uncaughtException");
});
process.once("unhandledRejection", (reason) => {
  console.error({ err: reason }, "simulation worker unhandled rejection");
  process.exitCode = 1;
  port.postMessage({
    type: "fatal",
    reason: "unhandledRejection",
    error: reason instanceof Error ? reason.message : String(reason)
  });
  void beginShutdown("unhandledRejection");
});
