// Shared bootstrap for the simulation process — used by both the standalone
// entry (apps/simulation/src/main.ts, kept for non-merged deployments and
// integration tests) and the in-process worker entry (worker-main.ts, spawned
// by the merged combined gateway). The two used to be near-duplicates; this
// helper holds the common setup so future changes happen in one place.
//
// The caller wires up its own lifecycle:
//   - standalone main.ts: process.on("SIGTERM"/"SIGINT"/"uncaughtException"/
//     "unhandledRejection") → beginShutdown(...)
//   - worker-main.ts: parentPort.on("message", { type: "shutdown" }) →
//     beginShutdown(...), plus posts the "ready"/"closed"/"fatal" messages.

import { createServer, type Server as HttpServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import v8 from "node:v8";
import { createListenerWatchdog } from "./listener-watchdog/listener-watchdog.js";
import { createSimulationService } from "./simulation-service/simulation-service.js";
import { parseSimulationRuntimeEnv, type SimulationRuntimeEnv } from "./runtime-env/runtime-env.js";

type ListenerWatchdog = ReturnType<typeof createListenerWatchdog>;

const SHUTDOWN_HARD_EXIT_MS = 10_000;

const stripIpv6Brackets = (value: string): string =>
  value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;

const isManagedRuntime = (): boolean => {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging" || typeof process.env.FLY_APP_NAME === "string";
};

const preferredRoutableProbeHost = (): string | undefined => {
  const envCandidates = [process.env.FLY_PRIVATE_IP, process.env.PRIVATE_IP]
    .map((value) => (typeof value === "string" ? stripIpv6Brackets(value.trim()) : ""))
    .filter(Boolean);
  return envCandidates[0];
};

export type SimulationProcessHandle = {
  service: Awaited<ReturnType<typeof createSimulationService>>;
  listenerWatchdog: ListenerWatchdog;
  metricsServer: HttpServer;
  runtimeEnv: SimulationRuntimeEnv;
  binding: { host: string; port: number; address: string };
  /**
   * Idempotent shutdown. Triggers a 10s hard-exit watchdog, then drains the
   * listener watchdog → metrics HTTP → simulation service. Calls `onClosed`
   * just before `process.exit(0)`, or `onFatal` then `process.exit(1)` if
   * close throws.
   */
  beginShutdown: (reason: string, details?: Record<string, unknown>) => Promise<void>;
};

type Hooks = {
  /** Called right before `process.exit(0)` on a clean shutdown. */
  onClosed?: () => void;
  /** Called when close throws or an uncaught error triggers shutdown. */
  onFatal?: (reason: string, error: string) => void;
};

export const bootstrapSimulationProcess = async (
  hooks: Hooks = {}
): Promise<SimulationProcessHandle> => {
  // Replay any persistence failure written by the previous run so it appears
  // in flyctl logs on restart (the original crash's log buffer may have scrolled).
  try {
    const dumpPath = "/data/last-persistence-failure.json";
    if (fs.existsSync(dumpPath)) {
      const raw = fs.readFileSync(dumpPath, "utf-8");
      console.error("[boot] previous run persistence failure:", raw);
      fs.unlinkSync(dumpPath);
    }
  } catch {
    // /data/ may not exist in dev; ignore silently
  }
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
    aiMinCommandIntervalMs: runtimeEnv.aiMinCommandIntervalMs,
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
    aiDryRun: runtimeEnv.aiDryRun,
    aiMaxCommandsPerTick: runtimeEnv.aiMaxCommandsPerTick,
    aiDisableExpand: runtimeEnv.aiDisableExpand,
    aiDisableBuild: runtimeEnv.aiDisableBuild,
    ...(runtimeEnv.systemPlayerIds ? { systemPlayerIds: runtimeEnv.systemPlayerIds } : {}),
    nonCompetitivePlayerIds: runtimeEnv.nonCompetitivePlayerIds
  });

  const binding = await service.start();
  // Only use the fly routable IP as the probe target when gRPC is actually
  // bound to a routable interface. SIMULATION_HOST="127.0.0.1" (the combined
  // build's default) means the gRPC listener is loopback-only — probing the
  // fly IPv6 private IP gets ECONNREFUSED and the watchdog immediately
  // declares unhealthy and SIGTERMs the worker, putting the machine into a
  // restart loop. Probe loopback in that case; the listenerWatchdog still
  // validates the gRPC server is up, just from inside the OS pid space
  // (which is the only path the in-process gateway uses anyway).
  const bindHostNormalized = binding.host.trim();
  const isLoopbackBind =
    bindHostNormalized === "127.0.0.1" ||
    bindHostNormalized === "::1" ||
    bindHostNormalized === "[::1]" ||
    bindHostNormalized === "localhost";
  const managedProbeHost = !isLoopbackBind && isManagedRuntime() ? preferredRoutableProbeHost() : undefined;

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
      // SIGTERM signals the whole OS process (shared across worker and main
      // thread in the merged build); the gateway's SIGTERM handler runs the
      // combined shutdown. Standalone deployments hit the same handler in
      // main.ts. process.exitCode = 1 ensures fly sees a non-zero exit and
      // restarts the machine.
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
    if (request.url && request.url.startsWith("/debug/heap-snapshot")) {
      // Ops-only: capture a .heapsnapshot to /data for offline retention analysis
      // (see event_loop_blocked entries with heapUsedMb near --max-old-space-size
      // and empty mainThreadTasks — GC thrash, not tracked JS work). Snapshotting
      // itself pauses the loop for the world's live heap size, so only trigger
      // this deliberately during a controlled load test, not on every request.
      // Pulling the resulting file off the box needs `flyctl sftp get`, which
      // has been unreliable in practice — prefer /debug/heap-stats below for
      // routine triage; only reach for this when you need real retainer graphs.
      try {
        const dumpPath = path.join("/data", `heap-${Date.now()}.heapsnapshot`);
        const writtenPath = v8.writeHeapSnapshot(dumpPath);
        const stat = fs.statSync(writtenPath);
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(`${JSON.stringify({ ok: true, path: writtenPath, bytes: stat.size })}\n`);
      } catch (err) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(`${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })}\n`);
      }
      return;
    }
    if (request.url && request.url.startsWith("/debug/heap-stats")) {
      // Cheap, synchronous, no file I/O — safe to poll repeatedly during a load
      // test to watch heap-space growth in real time without pausing the loop
      // for a full snapshot. getHeapSpaceStatistics breaks down old_space (long-
      // lived objects — the one that matters against --max-old-space-size) vs
      // new_space (young-gen churn) so we can tell "retention" from "GC just
      // hasn't run yet" at a glance.
      try {
        const heapStats = v8.getHeapStatistics();
        const spaceStats = v8.getHeapSpaceStatistics();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(`${JSON.stringify({ ok: true, memoryUsage: process.memoryUsage(), heapStats, spaceStats })}\n`);
      } catch (err) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(`${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })}\n`);
      }
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

  let shutdownPromise: Promise<void> | undefined;
  const beginShutdown = (reason: string, details?: Record<string, unknown>): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    console.info({ reason, ...(details ?? {}) }, "simulation process shutdown requested");
    const hardExitTimer = setTimeout(() => {
      console.error(
        { reason, hardExitMs: SHUTDOWN_HARD_EXIT_MS },
        "simulation shutdown deadline exceeded; force-exiting so fly can restart the machine"
      );
      process.exit(process.exitCode ?? 1);
    }, SHUTDOWN_HARD_EXIT_MS);
    hardExitTimer.unref();
    const closeAll = async (): Promise<void> => {
      listenerWatchdog.stop();
      await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
      await service.close();
    };
    shutdownPromise = closeAll()
      .then(() => {
        clearTimeout(hardExitTimer);
        hooks.onClosed?.();
        process.exit(process.exitCode ?? 0);
      })
      .catch((error) => {
        clearTimeout(hardExitTimer);
        console.error({ err: error, reason }, "simulation shutdown failed");
        hooks.onFatal?.(reason, error instanceof Error ? error.message : String(error));
        process.exit(process.exitCode ?? 1);
      });
    return shutdownPromise;
  };

  return { service, listenerWatchdog, metricsServer, runtimeEnv, binding, beginShutdown };
};
