// Out-of-thread watchdog for the Node event loop. When the main thread blocks
// (e.g. a 30s+ AI planner stall), Fastify's /healthz can still appear to
// "respond" once the loop unblocks, so Fly's http_service.checks don't reliably
// flag the machine — and even if they did, Fly only de-rotates the machine, it
// doesn't restart it. The combined-arch fly.combined.staging.toml has
// `restart.policy = "on-failure"` already, but that only triggers when the
// Node process exits non-zero. This watchdog provides that exit:
//
//   - A Worker thread runs on its own event loop and receives a heartbeat
//     from the main thread every `heartbeatIntervalMs`.
//   - If no heartbeat arrives for `stallThresholdMs`, the worker calls
//     `process.kill(process.pid, "SIGKILL")` which terminates the whole
//     OS process. Fly sees a non-zero exit and restarts the machine.
//
// We use SIGKILL deliberately: by the time we trigger, the main thread is
// definitionally unresponsive, so SIGTERM cannot be handled cleanly.
//
// Boot grace: simulation startup replay legitimately blocks the main thread
// for 30-90s while it rebuilds runtime state from the event store. The
// watchdog starts DISARMED and only begins checking heartbeats once the
// main thread calls `arm()` after gateway boot finishes. A failsafe auto-arm
// after `bootGraceMs` (default 5 min) handles the case where boot crashes
// silently — that way the watchdog still catches a "stuck booting forever"
// regression, just less aggressively.
//
// Disable entirely with WATCHDOG_ENABLED=0.

import { Worker } from "node:worker_threads";

const DEFAULT_HEARTBEAT_MS = 1000;
const DEFAULT_STALL_MS = 30_000;
const DEFAULT_BOOT_GRACE_MS = 300_000;

type WatchdogOptions = {
  heartbeatIntervalMs?: number;
  stallThresholdMs?: number;
  bootGraceMs?: number;
  enabled?: boolean;
  label?: string;
};

type WatchdogHandle = {
  arm: () => void;
  stop: () => Promise<void>;
};

const buildWorkerSource = (stallThresholdMs: number, bootGraceMs: number, label: string): string => `
  const { parentPort } = require("node:worker_threads");
  const STALL_MS = ${stallThresholdMs};
  const BOOT_GRACE_MS = ${bootGraceMs};
  const LABEL = ${JSON.stringify(label)};
  const bootStartedAt = Date.now();
  let lastPingAt = Date.now();
  let armed = false;
  let armReason = "";
  const armOnce = (reason) => {
    if (armed) return;
    armed = true;
    armReason = reason;
    lastPingAt = Date.now();
    process.stderr.write(JSON.stringify({
      level: 30,
      time: Date.now(),
      msg: "event_loop_watchdog_armed",
      label: LABEL,
      reason,
      bootElapsedMs: Date.now() - bootStartedAt
    }) + "\\n");
  };
  parentPort.on("message", (msg) => {
    if (!msg) return;
    if (msg.type === "ping" && typeof msg.at === "number") {
      lastPingAt = msg.at;
    } else if (msg.type === "arm") {
      armOnce("main_signal");
    } else if (msg.type === "stop") {
      process.exit(0);
    }
  });
  const probe = setInterval(() => {
    if (!armed) {
      if (Date.now() - bootStartedAt >= BOOT_GRACE_MS) {
        armOnce("boot_grace_expired");
      }
      return;
    }
    const stalledMs = Date.now() - lastPingAt;
    if (stalledMs > STALL_MS) {
      process.stderr.write(JSON.stringify({
        level: 60,
        time: Date.now(),
        msg: "event_loop_watchdog_kill",
        label: LABEL,
        armReason,
        stalledMs,
        stallThresholdMs: STALL_MS
      }) + "\\n");
      // Force-kill the whole process group; the main thread is unresponsive
      // so a graceful signal can't be acknowledged.
      process.kill(process.pid, "SIGKILL");
    }
  }, 500);
  probe.unref();
`;

const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
  return fallback;
};

const parseNumber = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const startEventLoopWatchdog = (options: WatchdogOptions = {}): WatchdogHandle | null => {
  const enabled = options.enabled ?? parseBool(process.env.WATCHDOG_ENABLED, true);
  if (!enabled) {
    return null;
  }
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? parseNumber(process.env.WATCHDOG_HEARTBEAT_MS, DEFAULT_HEARTBEAT_MS);
  const stallThresholdMs =
    options.stallThresholdMs ?? parseNumber(process.env.WATCHDOG_STALL_MS, DEFAULT_STALL_MS);
  const bootGraceMs =
    options.bootGraceMs ?? parseNumber(process.env.WATCHDOG_BOOT_GRACE_MS, DEFAULT_BOOT_GRACE_MS);
  const label = options.label ?? "combined";

  const worker = new Worker(buildWorkerSource(stallThresholdMs, bootGraceMs, label), { eval: true });
  worker.unref();
  worker.on("error", (err) => {
    process.stderr.write(
      `${JSON.stringify({ level: 50, time: Date.now(), msg: "event_loop_watchdog_error", error: err?.message ?? String(err) })}\n`
    );
  });

  const heartbeat = setInterval(() => {
    worker.postMessage({ type: "ping", at: Date.now() });
  }, heartbeatIntervalMs);
  heartbeat.unref();

  worker.postMessage({ type: "ping", at: Date.now() });

  process.stderr.write(
    `${JSON.stringify({
      level: 30,
      time: Date.now(),
      msg: "event_loop_watchdog_started",
      label,
      heartbeatIntervalMs,
      stallThresholdMs,
      bootGraceMs
    })}\n`
  );

  return {
    arm: () => {
      worker.postMessage({ type: "arm" });
    },
    stop: async () => {
      clearInterval(heartbeat);
      worker.postMessage({ type: "stop" });
      await worker.terminate();
    }
  };
};
