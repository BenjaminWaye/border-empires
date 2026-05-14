// Single-process entry: boots the simulation gRPC server on loopback inside
// this Node runtime, then boots the gateway pointed at it. Saves the second
// Node V8 baseline (~50-70 MB) compared to running them as two processes.
import { createSimulationService } from "../../simulation/src/simulation-service.js";
import { parseSimulationRuntimeEnv } from "../../simulation/src/runtime-env.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env.js";

const simEnv = parseSimulationRuntimeEnv(process.env);

// Force loopback for in-process gRPC. We never expose the sim port externally.
const simHost = "127.0.0.1";
const simPort = simEnv.port;

const simService = await createSimulationService({
  host: simHost,
  port: simPort,
  ...(simEnv.databaseUrl ? { databaseUrl: simEnv.databaseUrl } : {}),
  ...(simEnv.sqlitePath ? { sqlitePath: simEnv.sqlitePath } : {}),
  ...(simEnv.snapshotDir ? { snapshotDir: simEnv.snapshotDir } : {}),
  applySchema: simEnv.applySchema,
  checkpointEveryEvents: simEnv.checkpointEveryEvents,
  writeCheckpointProjections: simEnv.writeCheckpointProjections,
  checkpointForceAfterEvents: simEnv.checkpointForceAfterEvents,
  startupReplayCompactionMinEvents: simEnv.startupReplayCompactionMinEvents,
  ...(typeof simEnv.checkpointMaxRssBytes === "number" ? { checkpointMaxRssBytes: simEnv.checkpointMaxRssBytes } : {}),
  ...(typeof simEnv.checkpointMaxHeapUsedBytes === "number"
    ? { checkpointMaxHeapUsedBytes: simEnv.checkpointMaxHeapUsedBytes }
    : {}),
  seedProfile: simEnv.seedProfile,
  ...(simEnv.rulesetId ? { rulesetId: simEnv.rulesetId } : {}),
  ...(typeof simEnv.aiPlayerCount === "number" ? { aiPlayerCount: simEnv.aiPlayerCount } : {}),
  enableAiAutopilot: simEnv.enableAiAutopilot,
  aiTickMs: simEnv.aiTickMs,
  aiMaxEventLoopLagMs: simEnv.aiMaxEventLoopLagMs,
  enableSystemAutopilot: simEnv.enableSystemAutopilot,
  systemTickMs: simEnv.systemTickMs,
  globalStatusBroadcastDebounceMs: simEnv.globalStatusBroadcastDebounceMs,
  startupRecoveryTimeoutMs: simEnv.startupRecoveryTimeoutMs,
  allowSeedRecoveryFallback: simEnv.allowSeedRecoveryFallback,
  ...(typeof simEnv.requireDurableStartupState === "boolean"
    ? { requireDurableStartupState: simEnv.requireDurableStartupState }
    : {}),
  useAiWorker: simEnv.useAiWorker,
  ...(simEnv.systemPlayerIds ? { systemPlayerIds: simEnv.systemPlayerIds } : {})
});

const simBinding = await simService.start();

console.log(`[merged] simulation gRPC bound at ${simBinding.address}`);

// Override the gateway's simulationAddress to always point at our in-process loopback.
process.env.SIMULATION_ADDRESS = `${simHost}:${simPort}`;
process.env.GATEWAY_SIMULATION_WAKE_ADDRESS = `${simHost}:${simPort}`;
const gatewayEnv = parseRealtimeGatewayRuntimeEnv(process.env);

const gateway = await createRealtimeGatewayApp({
  host: gatewayEnv.host,
  port: gatewayEnv.port,
  simulationAddress: gatewayEnv.simulationAddress,
  ...(gatewayEnv.simulationWakeAddress ? { simulationWakeAddress: gatewayEnv.simulationWakeAddress } : {}),
  ...(gatewayEnv.databaseUrl ? { databaseUrl: gatewayEnv.databaseUrl } : {}),
  ...(gatewayEnv.sqlitePath ? { sqlitePath: gatewayEnv.sqlitePath } : {}),
  ...(gatewayEnv.snapshotDir ? { snapshotDir: gatewayEnv.snapshotDir } : {}),
  applySchema: gatewayEnv.applySchema,
  ...(gatewayEnv.defaultHumanPlayerId ? { defaultHumanPlayerId: gatewayEnv.defaultHumanPlayerId } : {}),
  simulationSeedProfile: gatewayEnv.simulationSeedProfile,
  allowNonAuthoritativeInitialState: gatewayEnv.allowNonAuthoritativeInitialState,
  ...(gatewayEnv.adminApiToken ? { adminApiToken: gatewayEnv.adminApiToken } : {}),
  ...(gatewayEnv.fogAdminEmail ? { fogAdminEmail: gatewayEnv.fogAdminEmail } : {}),
  emailAlerts: gatewayEnv.emailAlerts
});

await gateway.start();
console.log(`[merged] gateway listening on ${gatewayEnv.host}:${gatewayEnv.port}`);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`[merged] caught ${signal}; shutting down`);
  try {
    await gateway.close();
  } catch (error) {
    console.error("[merged] gateway close error:", error);
  }
  try {
    await simService.close();
  } catch (error) {
    console.error("[merged] simulation close error:", error);
  }
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
