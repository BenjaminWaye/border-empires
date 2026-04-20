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
  ...(typeof runtimeEnv.checkpointMaxRssBytes === "number" ? { checkpointMaxRssBytes: runtimeEnv.checkpointMaxRssBytes } : {}),
  ...(typeof runtimeEnv.checkpointMaxHeapUsedBytes === "number"
    ? { checkpointMaxHeapUsedBytes: runtimeEnv.checkpointMaxHeapUsedBytes }
    : {}),
  seedProfile: runtimeEnv.seedProfile,
  enableAiAutopilot: runtimeEnv.enableAiAutopilot,
  aiTickMs: runtimeEnv.aiTickMs,
  enableSystemAutopilot: runtimeEnv.enableSystemAutopilot,
  systemTickMs: runtimeEnv.systemTickMs,
  globalStatusBroadcastDebounceMs: runtimeEnv.globalStatusBroadcastDebounceMs,
  startupRecoveryTimeoutMs: runtimeEnv.startupRecoveryTimeoutMs,
  allowSeedRecoveryFallback: runtimeEnv.allowSeedRecoveryFallback,
  ...(runtimeEnv.systemPlayerIds ? { systemPlayerIds: runtimeEnv.systemPlayerIds } : {})
});

await service.start();
