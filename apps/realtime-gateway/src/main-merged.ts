// Single-process entry: spawns the simulation in a dedicated worker thread,
// then boots the gateway on the main thread pointed at it. The previous
// design ran sim and gateway on the same event loop, so any heavy sync work
// in the sim (e.g. a slow COLLECT_VISIBLE apply) blocked the gateway's
// /healthz and WebSocket upgrades — fly's health checks timed out, the
// proxy de-rotated the machine, and the watchdog SIGKILL'd a process that
// was just doing CPU work. Isolating the sim into its own worker keeps the
// gateway main loop responsive no matter how long a sim apply takes.
//
// We still pay one Node V8 baseline because workers share the process; the
// extra cost is a separate event loop + heap inside the same OS process,
// which is far cheaper than the old two-process arrangement and structurally
// stronger than the previous shared-loop design.
import { Worker } from "node:worker_threads";
import { resolveWorkerEntryUrl } from "../../simulation/src/resolve-worker-entry/resolve-worker-entry.js";
import { parseSimulationRuntimeEnv } from "../../simulation/src/runtime-env/runtime-env.js";
import {
  DEATH_FORENSICS_PATH,
  replayDeathForensicsOnBoot,
  writeDeathForensics
} from "./death-forensics.js";
import { startEventLoopWatchdog } from "./event-loop-watchdog.js";
import { createRealtimeGatewayApp } from "./gateway-app/gateway-app.js";
import { parseRealtimeGatewayRuntimeEnv } from "./runtime-env/runtime-env.js";

// Replay any forensics persisted by a prior death before we arm the watchdog.
replayDeathForensicsOnBoot();

type SimWorkerReadyMessage = {
  type: "ready";
  grpcAddress: string;
  metricsHost: string;
  metricsPort: number;
};
type SimWorkerClosedMessage = { type: "closed" };
type SimWorkerFatalMessage = { type: "fatal"; reason: string; error: string };
type SimWorkerDiagBufferMessage = { type: "diag_buffer"; entries: unknown[] };
type SimWorkerMessage =
  | SimWorkerReadyMessage
  | SimWorkerClosedMessage
  | SimWorkerFatalMessage
  | SimWorkerDiagBufferMessage;

// Sim lag-diagnostic ring buffer forwarded from the sim worker thread.
// Updated at ≤1 Hz; read at kill/exit time to name the likely cause.
let latestSimDiagnostics: unknown[] = [];

// Parse the sim env in the parent purely to validate it early (so a typo
// crashes the parent with a clear error) and to know the loopback address
// the gateway should dial. The worker re-parses the same env independently.
const simEnv = parseSimulationRuntimeEnv(process.env);
const simHost = "127.0.0.1";
const simPort = simEnv.port;

const workerEntryUrl = resolveWorkerEntryUrl("./worker-main.js", import.meta.url);
const simWorker = new Worker(workerEntryUrl);
let simWorkerExitedUnexpectedly = false;

// Lightweight event-loop lag probe on the main (gateway) thread — independent
// of the gateway metrics internals so the watchdog snapshot can read it without
// needing a reference to the gateway metrics object.
let mainThreadEventLoopLagMs = 0;
const lagProbe = setInterval(() => {
  const before = Date.now();
  setImmediate(() => {
    mainThreadEventLoopLagMs = Date.now() - before;
  });
}, 1000);
lagProbe.unref();

// Boot the event-loop watchdog FIRST so it can observe boot itself, but
// leave it DISARMED — gateway boot is fast (no sim replay on the main
// thread anymore), but worker startup + replay can still take time and we
// don't want a spurious arm window. We arm it after `gateway.start()`
// returns; from that point any 30s+ main-thread block is a real bug because
// the sim cannot block this thread.
const watchdog = startEventLoopWatchdog({
  label: "combined",
  deathForensicsPath: DEATH_FORENSICS_PATH,
  getDiagSnapshot: () => {
    const mem = process.memoryUsage();
    return {
      snapshotAt: Date.now(),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      mainThreadEventLoopLagMs,
      simWorkerAlive: !simWorkerExitedUnexpectedly,
      aiEnabled: simEnv.enableAiAutopilot,
      aiWorker: simEnv.useAiWorker,
      aiDryRun: simEnv.aiDryRun,
      aiDisableExpand: simEnv.aiDisableExpand,
      aiDisableBuild: simEnv.aiDisableBuild,
      simDiagnostics: latestSimDiagnostics
    };
  }
});

simWorker.on("error", (err) => {
  console.error("[merged] simulation worker error:", err);
  simWorkerExitedUnexpectedly = true;
});
simWorker.on("exit", (code) => {
  if (code !== 0) {
    console.error(`[merged] simulation worker exited code=${code}; exiting process so fly restarts the machine`);
    simWorkerExitedUnexpectedly = true;
    writeDeathForensics({
      deathKind: "sim_worker_exit",
      at: Date.now(),
      code,
      latestSimDiagnostics,
      heap: process.memoryUsage()
    });
    process.exit(code || 1);
  }
});

// Capture sim diag_buffer messages forwarded from the worker thread.
// All other lifecycle messages are handled in the simReady promise below.
simWorker.on("message", (raw: unknown) => {
  if (!raw || typeof raw !== "object") return;
  const msg = raw as SimWorkerMessage;
  if (msg.type === "diag_buffer") {
    latestSimDiagnostics = Array.isArray(msg.entries) ? msg.entries : [];
  }
});

const simReady = await new Promise<SimWorkerReadyMessage>((resolve, reject) => {
  const onMessage = (raw: unknown): void => {
    if (!raw || typeof raw !== "object") return;
    const msg = raw as SimWorkerMessage;
    if (msg.type === "ready") {
      simWorker.off("message", onMessage);
      resolve(msg);
    } else if (msg.type === "fatal") {
      simWorker.off("message", onMessage);
      reject(new Error(`simulation worker fatal during startup: ${msg.reason} — ${msg.error}`));
    }
  };
  simWorker.on("message", onMessage);
  simWorker.once("exit", (code) => {
    if (code !== 0) reject(new Error(`simulation worker exited code=${code} before ready`));
  });
});

console.log(`[merged] simulation gRPC bound at ${simReady.grpcAddress}`);
console.log(`[merged] simulation metrics bound at ${simReady.metricsHost}:${simReady.metricsPort}`);

// Override the gateway's simulationAddress to always point at the worker's
// loopback gRPC. We never expose the sim port externally.
process.env.SIMULATION_ADDRESS = `${simHost}:${simPort}`;
process.env.GATEWAY_SIMULATION_WAKE_ADDRESS = `${simHost}:${simPort}`;
const gatewayEnv = parseRealtimeGatewayRuntimeEnv(process.env);

const gateway = await createRealtimeGatewayApp({
  host: gatewayEnv.host,
  port: gatewayEnv.port,
  simulationAddress: gatewayEnv.simulationAddress,
  ...(gatewayEnv.simulationWakeAddress ? { simulationWakeAddress: gatewayEnv.simulationWakeAddress } : {}),
  ...(gatewayEnv.sqlitePath ? { sqlitePath: gatewayEnv.sqlitePath } : {}),
  ...(gatewayEnv.snapshotDir ? { snapshotDir: gatewayEnv.snapshotDir } : {}),
  applySchema: gatewayEnv.applySchema,
  ...(gatewayEnv.defaultHumanPlayerId ? { defaultHumanPlayerId: gatewayEnv.defaultHumanPlayerId } : {}),
  simulationSeedProfile: gatewayEnv.simulationSeedProfile,
  allowNonAuthoritativeInitialState: gatewayEnv.allowNonAuthoritativeInitialState,
  ...(gatewayEnv.adminApiToken ? { adminApiToken: gatewayEnv.adminApiToken } : {}),
  ...(gatewayEnv.fogAdminEmail ? { fogAdminEmail: gatewayEnv.fogAdminEmail } : {}),
  emailAlerts: gatewayEnv.emailAlerts,
  simMetricsUrl: `http://${simReady.metricsHost}:${simReady.metricsPort}/metrics`
});

await gateway.start();
console.log(`[merged] gateway listening on ${gatewayEnv.host}:${gatewayEnv.port}`);
watchdog?.arm();

const SIM_WORKER_SHUTDOWN_TIMEOUT_MS = 12_000;

const waitForSimWorkerClosed = (): Promise<void> =>
  new Promise<void>((resolve) => {
    const settle = (): void => {
      simWorker.off("message", onMessage);
      resolve();
    };
    const onMessage = (raw: unknown): void => {
      if (!raw || typeof raw !== "object") return;
      const msg = raw as SimWorkerMessage;
      if (msg.type === "closed" || msg.type === "fatal") settle();
    };
    simWorker.on("message", onMessage);
    simWorker.once("exit", settle);
    setTimeout(settle, SIM_WORKER_SHUTDOWN_TIMEOUT_MS).unref();
  });

let shutdownInFlight: Promise<void> | undefined;
const shutdown = (signal: NodeJS.Signals | "uncaught"): Promise<void> => {
  if (shutdownInFlight) return shutdownInFlight;
  console.log(`[merged] caught ${signal}; shutting down`);
  shutdownInFlight = (async () => {
    try {
      gateway.notifyDeployment();
    } catch (error) {
      console.error("[merged] notifyDeployment error:", error);
    }
    try {
      await gateway.close();
    } catch (error) {
      console.error("[merged] gateway close error:", error);
    }
    if (!simWorkerExitedUnexpectedly) {
      try {
        simWorker.postMessage({ type: "shutdown", reason: signal });
      } catch (error) {
        console.error("[merged] simulation worker postMessage(shutdown) failed:", error);
      }
      await waitForSimWorkerClosed();
    }
    try {
      await simWorker.terminate();
    } catch (error) {
      console.error("[merged] simulation worker terminate error:", error);
    }
    process.exit(0);
  })();
  return shutdownInFlight;
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
