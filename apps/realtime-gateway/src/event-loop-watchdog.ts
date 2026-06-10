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
// Rate limit: a "kill at" timestamp is persisted to a file under the
// mounted volume. If a stall is detected within `minKillIntervalMs` of the
// last kill, we DO NOT kill — we log "rate_limited" and leave the process
// running. The bet: if the watchdog is firing more often than once every
// 30 min, staging is in a deeper failure mode that auto-restart cannot
// fix, and the machine should stay up (unprotected) so a human notices
// and intervenes rather than burning through Fly's max_retries cap.
// Manually reset by deleting the file (`rm /data/.watchdog-last-kill`).
//
// Disable entirely with WATCHDOG_ENABLED=0.

import { Worker } from "node:worker_threads";

const DEFAULT_HEARTBEAT_MS = 1000;
const DEFAULT_STALL_MS = 30_000;
const DEFAULT_BOOT_GRACE_MS = 300_000;
const DEFAULT_MIN_KILL_INTERVAL_MS = 1_800_000; // 30 min
const DEFAULT_KILL_STATE_PATH = "/data/.watchdog-last-kill";

type WatchdogOptions = {
  heartbeatIntervalMs?: number;
  stallThresholdMs?: number;
  bootGraceMs?: number;
  minKillIntervalMs?: number;
  killStatePath?: string;
  enabled?: boolean;
  label?: string;
  /** Called on each heartbeat; result is piggybacked on the ping so the
   *  worker can log last-known runtime state at kill/rate-limit time. */
  getDiagSnapshot?: () => Record<string, unknown>;
};

type WatchdogHandle = {
  arm: () => void;
  stop: () => Promise<void>;
};

const buildWorkerSource = (params: {
  stallThresholdMs: number;
  bootGraceMs: number;
  minKillIntervalMs: number;
  killStatePath: string;
  label: string;
}): string => `
  const { parentPort } = require("node:worker_threads");
  const fs = require("node:fs");
  const STALL_MS = ${params.stallThresholdMs};
  const BOOT_GRACE_MS = ${params.bootGraceMs};
  const MIN_KILL_INTERVAL_MS = ${params.minKillIntervalMs};
  const KILL_STATE_PATH = ${JSON.stringify(params.killStatePath)};
  const LABEL = ${JSON.stringify(params.label)};
  const bootStartedAt = Date.now();
  let lastPingAt = Date.now();
  let armed = false;
  let armReason = "";
  let lastDiag = {};

  const readLastKillAt = () => {
    try {
      const raw = fs.readFileSync(KILL_STATE_PATH, "utf8").trim();
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (err) {
      // ENOENT is normal (no prior kill); other errors are best-effort.
      return 0;
    }
  };
  const writeLastKillAt = (at) => {
    try {
      fs.writeFileSync(KILL_STATE_PATH, String(at), "utf8");
      return true;
    } catch (err) {
      process.stderr.write(JSON.stringify({
        level: 50,
        time: Date.now(),
        msg: "event_loop_watchdog_state_write_failed",
        label: LABEL,
        path: KILL_STATE_PATH,
        error: (err && err.message) || String(err)
      }) + "\\n");
      return false;
    }
  };

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
      if (msg.diag && typeof msg.diag === "object") lastDiag = msg.diag;
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
    if (stalledMs <= STALL_MS) return;

    const now = Date.now();
    const lastKillAt = readLastKillAt();
    const sinceLastKillMs = lastKillAt > 0 ? now - lastKillAt : Number.POSITIVE_INFINITY;
    if (sinceLastKillMs < MIN_KILL_INTERVAL_MS) {
      // Rate-limited: don't restart-loop on a sustained regression. Log once
      // per probe so admins can see the watchdog is intentionally holding back.
      process.stderr.write(JSON.stringify({
        level: 50,
        time: now,
        msg: "event_loop_watchdog_rate_limited",
        label: LABEL,
        armReason,
        stalledMs,
        stallThresholdMs: STALL_MS,
        sinceLastKillMs,
        minKillIntervalMs: MIN_KILL_INTERVAL_MS,
        lastDiag
      }) + "\\n");
      return;
    }

    writeLastKillAt(now);
    process.stderr.write(JSON.stringify({
      level: 60,
      time: now,
      msg: "event_loop_watchdog_kill",
      label: LABEL,
      armReason,
      stalledMs,
      stallThresholdMs: STALL_MS,
      sinceLastKillMs: lastKillAt > 0 ? sinceLastKillMs : null,
      lastDiag
    }) + "\\n");
    // Force-kill the whole process; the main thread is unresponsive so
    // a graceful signal can't be acknowledged.
    process.kill(process.pid, "SIGKILL");
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

const parseString = (raw: string | undefined, fallback: string): string => {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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
  const minKillIntervalMs =
    options.minKillIntervalMs ?? parseNumber(process.env.WATCHDOG_MIN_KILL_INTERVAL_MS, DEFAULT_MIN_KILL_INTERVAL_MS);
  const killStatePath =
    options.killStatePath ?? parseString(process.env.WATCHDOG_KILL_STATE_PATH, DEFAULT_KILL_STATE_PATH);
  const label = options.label ?? "combined";

  const worker = new Worker(
    buildWorkerSource({ stallThresholdMs, bootGraceMs, minKillIntervalMs, killStatePath, label }),
    { eval: true }
  );
  worker.unref();
  worker.on("error", (err) => {
    process.stderr.write(
      `${JSON.stringify({ level: 50, time: Date.now(), msg: "event_loop_watchdog_error", error: err?.message ?? String(err) })}\n`
    );
  });

  const heartbeat = setInterval(() => {
    const diag = options.getDiagSnapshot?.();
    worker.postMessage({ type: "ping", at: Date.now(), ...(diag ? { diag } : {}) });
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
      bootGraceMs,
      minKillIntervalMs,
      killStatePath
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
