import { createServer } from "node:http";

import { createSimulationService } from "./simulation-service.js";
import { parseSimulationRuntimeEnv } from "./runtime-env.js";

const runtimeEnv = parseSimulationRuntimeEnv(process.env);
const service = await createSimulationService({
  host: runtimeEnv.host,
  port: runtimeEnv.port,
  ...(runtimeEnv.databaseUrl ? { databaseUrl: runtimeEnv.databaseUrl } : {}),
  ...(runtimeEnv.snapshotDir ? { snapshotDir: runtimeEnv.snapshotDir } : {}),
  applySchema: runtimeEnv.applySchema,
  checkpointEveryEvents: runtimeEnv.checkpointEveryEvents,
  startupReplayCompactionMinEvents: runtimeEnv.startupReplayCompactionMinEvents,
  ...(typeof runtimeEnv.checkpointMaxRssBytes === "number" ? { checkpointMaxRssBytes: runtimeEnv.checkpointMaxRssBytes } : {}),
  ...(typeof runtimeEnv.checkpointMaxHeapUsedBytes === "number"
    ? { checkpointMaxHeapUsedBytes: runtimeEnv.checkpointMaxHeapUsedBytes }
    : {}),
  seedProfile: runtimeEnv.seedProfile,
  enableAiAutopilot: runtimeEnv.enableAiAutopilot,
  aiTickMs: runtimeEnv.aiTickMs,
  aiMaxEventLoopLagMs: runtimeEnv.aiMaxEventLoopLagMs,
  enableSystemAutopilot: runtimeEnv.enableSystemAutopilot,
  systemTickMs: runtimeEnv.systemTickMs,
  globalStatusBroadcastDebounceMs: runtimeEnv.globalStatusBroadcastDebounceMs,
  startupRecoveryTimeoutMs: runtimeEnv.startupRecoveryTimeoutMs,
  allowSeedRecoveryFallback: runtimeEnv.allowSeedRecoveryFallback,
  useAiWorker: runtimeEnv.useAiWorker,
  ...(runtimeEnv.systemPlayerIds ? { systemPlayerIds: runtimeEnv.systemPlayerIds } : {})
});

await service.start();

const metricsServer = createServer((request, response) => {
  if (request.url !== "/metrics") {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  response.end(service.renderMetrics());
});

await new Promise<void>((resolve, reject) => {
  metricsServer.once("error", reject);
  metricsServer.listen(runtimeEnv.metricsPort, runtimeEnv.metricsHost, () => {
    metricsServer.off("error", reject);
    resolve();
  });
});

const closeWithMetrics = async (): Promise<void> => {
  await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
  await service.close();
};

process.once("SIGTERM", () => {
  void closeWithMetrics();
});
process.once("SIGINT", () => {
  void closeWithMetrics();
});
