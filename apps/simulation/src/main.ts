import { createServer } from "node:http";
import { createListenerWatchdog } from "./listener-watchdog.js";
import { createSimulationService } from "./simulation-service.js";
import { parseSimulationRuntimeEnv } from "./runtime-env.js";

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
  ...(runtimeEnv.databaseUrl ? { databaseUrl: runtimeEnv.databaseUrl } : {}),
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

const listenerWatchdog = createListenerWatchdog({
  bindHost: binding.host,
  port: binding.port,
  ...(managedRuntime ? { probeHost: preferredRoutableProbeHost() } : {}),
  probeIntervalMs: runtimeEnv.healthProbeIntervalMs,
  probeTimeoutMs: runtimeEnv.healthProbeTimeoutMs,
  failureThreshold: runtimeEnv.healthFailureThreshold,
  log: console,
  onUnhealthy: (snapshot) => {
    console.error({ snapshot }, "simulation listener watchdog declared unhealthy; exiting for restart");
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

const metricsServer = createServer((request, response) => {
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
  "simulation process listeners ready"
);

let shutdownPromise: Promise<void> | undefined;
const closeWithMetrics = async (): Promise<void> => {
  listenerWatchdog.stop();
  await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
  await service.close();
};

const beginShutdown = (reason: string, details?: Record<string, unknown>): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  console.info({ reason, ...(details ?? {}) }, "simulation process shutdown requested");
  shutdownPromise = closeWithMetrics().catch((error) => {
    console.error({ err: error, reason }, "simulation process shutdown failed");
    throw error;
  });
  return shutdownPromise;
};

process.once("SIGTERM", () => {
  void beginShutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void beginShutdown("SIGINT");
});
process.once("uncaughtException", (error) => {
  console.error({ err: error }, "simulation process uncaught exception");
  process.exitCode = 1;
  void beginShutdown("uncaughtException");
});
process.once("unhandledRejection", (reason) => {
  console.error({ err: reason }, "simulation process unhandled rejection");
  process.exitCode = 1;
  void beginShutdown("unhandledRejection");
});
