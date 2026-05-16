// Single-process entry: boots the simulation gRPC server on loopback inside
// this Node runtime, then boots the gateway pointed at it. Saves the second
// Node V8 baseline (~50-70 MB) compared to running them as two processes.
import { createServer } from "node:http";
import { createSimulationService } from "../../simulation/src/simulation-service.js";
import { parseSimulationRuntimeEnv } from "../../simulation/src/runtime-env.js";
import { startEventLoopWatchdog } from "./event-loop-watchdog.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env.js";

// Boot the event-loop watchdog FIRST so it can observe boot itself, but
// leave it DISARMED — sim replay legitimately blocks the main thread for
// 30-90s during startup. We arm it after `gateway.start()` returns, which
// is the point at which any sustained block is a real bug, not boot work.
// A worker-side failsafe arms after WATCHDOG_BOOT_GRACE_MS (default 5 min)
// so the watchdog still catches a "stuck booting forever" regression.
const watchdog = startEventLoopWatchdog({ label: "combined" });

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

// Standalone sim (apps/simulation/src/main.ts) binds a tiny HTTP server on
// SIMULATION_METRICS_PORT for `/metrics` + `/health`. The merged entry has
// to mirror that explicitly — otherwise the per-player diag buffers
// (sim_ai_settle_decision_recent, etc.) are only reachable via the 1Hz
// stdout dump, which fly logs throttles too aggressively to catch.
const simHealthResponse = () => {
  const health = simService.healthSnapshot();
  return {
    statusCode: health.ok ? 200 : 503,
    body: health
  };
};
const simMetricsServer = createServer((request, response) => {
  if (request.url === "/metrics") {
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.end(simService.renderMetrics());
    return;
  }
  if (request.url === "/health" || request.url === "/healthz") {
    const health = simHealthResponse();
    response.statusCode = health.statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify(health.body)}\n`);
    return;
  }
  if (request.url && request.url.startsWith("/debug/players")) {
    const aiOnly = /[?&]ai=(true|1)\b/.test(request.url);
    const players = simService.playerDebugSnapshot();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify({ players: aiOnly ? players.filter((p) => p.isAi) : players })}\n`);
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});
await new Promise<void>((resolve, reject) => {
  simMetricsServer.once("error", reject);
  simMetricsServer.listen(simEnv.metricsPort, simEnv.metricsHost, () => {
    simMetricsServer.off("error", reject);
    resolve();
  });
});
console.log(`[merged] simulation metrics bound at ${simEnv.metricsHost}:${simEnv.metricsPort}`);

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
watchdog?.arm();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`[merged] caught ${signal}; shutting down`);
  try {
    await gateway.close();
  } catch (error) {
    console.error("[merged] gateway close error:", error);
  }
  try {
    await new Promise<void>((resolve) => simMetricsServer.close(() => resolve()));
  } catch (error) {
    console.error("[merged] simulation metrics close error:", error);
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
