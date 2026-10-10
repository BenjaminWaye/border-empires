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
// Stall stacks: once the main thread has been silent for `stackCaptureMs`
// (default 10s; WATCHDOG_STACK_CAPTURE_MS=0 disables), the worker pauses it via
// the inspector and records its JS stack (main-thread-stack-capture.ts), up to
// three times per stall. Stacks are logged as `event_loop_stall_stack`, again
// with the stall length in `event_loop_stall_recovered` if the thread comes
// back, and included in the kill log and death forensics if it doesn't.
//
// The worker writes its logs straight to fd 2: `process.stderr` in a worker is
// relayed through the main thread, so anything written during a stall was
// lost when the kill landed.
//
// Disable entirely with WATCHDOG_ENABLED=0.

import { Worker } from "node:worker_threads";

import { DEATH_FORENSICS_PATH } from "./death-forensics.js";
import { MAIN_THREAD_STACK_CAPTURE_SOURCE } from "./main-thread-stack-capture/main-thread-stack-capture.js";

const DEFAULT_HEARTBEAT_MS = 1000;
const DEFAULT_STALL_MS = 30_000;
const DEFAULT_BOOT_GRACE_MS = 300_000;
const DEFAULT_MIN_KILL_INTERVAL_MS = 1_800_000; // 30 min
const DEFAULT_KILL_STATE_PATH = "/data/.watchdog-last-kill";
const DEFAULT_STACK_CAPTURE_MS = 10_000;

type WatchdogOptions = {
  heartbeatIntervalMs?: number;
  stallThresholdMs?: number;
  bootGraceMs?: number;
  minKillIntervalMs?: number;
  /** Stall length at which to capture the main thread's JS stack; 0 disables. */
  stackCaptureMs?: number;
  killStatePath?: string;
  deathForensicsPath?: string;
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
  stackCaptureMs: number;
  killStatePath: string;
  label: string;
  deathForensicsPath: string;
}): string => `
  const { parentPort } = require("node:worker_threads");
  const fs = require("node:fs");
  ${MAIN_THREAD_STACK_CAPTURE_SOURCE}
  const writeStderr = (line) => {
    try { fs.writeSync(2, line); } catch (err) { /* nowhere left to report */ }
  };
  const STACK_CAPTURE_MS = ${params.stackCaptureMs};
  const MAX_STACKS_PER_STALL = 3;
  let stallStacks = [];
  let nextStackCaptureAtMs = STACK_CAPTURE_MS;
  const STALL_MS = ${params.stallThresholdMs};
  const BOOT_GRACE_MS = ${params.bootGraceMs};
  const MIN_KILL_INTERVAL_MS = ${params.minKillIntervalMs};
  const KILL_STATE_PATH = ${JSON.stringify(params.killStatePath)};
  const DEATH_FORENSICS_PATH = ${JSON.stringify(params.deathForensicsPath)};
  const LABEL = ${JSON.stringify(params.label)};
  const bootStartedAt = Date.now();

  const writeDeathForensics = (blob) => {
    try {
      fs.writeFileSync(DEATH_FORENSICS_PATH, JSON.stringify(blob), "utf8");
    } catch (err) {
      writeStderr(JSON.stringify({
        level: 50,
        time: Date.now(),
        msg: "death_forensics_write_failed",
        label: LABEL,
        path: DEATH_FORENSICS_PATH,
        error: (err && err.message) || String(err)
      }) + "\\n");
    }
  };
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
      writeStderr(JSON.stringify({
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
    writeStderr(JSON.stringify({
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
      if (stallStacks.length > 0) {
        writeStderr(JSON.stringify({
          level: 40,
          time: Date.now(),
          msg: "event_loop_stall_recovered",
          label: LABEL,
          stalledMs: msg.at - lastPingAt,
          stallStacks
        }) + "\\n");
      }
      stallStacks = [];
      nextStackCaptureAtMs = STACK_CAPTURE_MS;
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
    if (STACK_CAPTURE_MS > 0 && stalledMs >= nextStackCaptureAtMs && stallStacks.length < MAX_STACKS_PER_STALL) {
      nextStackCaptureAtMs += STACK_CAPTURE_MS;
      captureMainThreadStack(2000, 25, (result) => {
        const entry = Object.assign({ atStalledMs: stalledMs }, result);
        stallStacks.push(entry);
        writeStderr(JSON.stringify({
          level: 40,
          time: Date.now(),
          msg: "event_loop_stall_stack",
          label: LABEL,
          lastDiag,
          stack: entry
        }) + "\\n");
      });
    }
    if (stalledMs <= STALL_MS) return;

    const now = Date.now();
    const lastKillAt = readLastKillAt();
    const sinceLastKillMs = lastKillAt > 0 ? now - lastKillAt : Number.POSITIVE_INFINITY;
    if (sinceLastKillMs < MIN_KILL_INTERVAL_MS) {
      // Rate-limited: don't restart-loop on a sustained regression. Log once
      // per probe so admins can see the watchdog is intentionally holding back.
      writeStderr(JSON.stringify({
        level: 50,
        time: now,
        msg: "event_loop_watchdog_rate_limited",
        label: LABEL,
        armReason,
        stalledMs,
        stallThresholdMs: STALL_MS,
        sinceLastKillMs,
        minKillIntervalMs: MIN_KILL_INTERVAL_MS,
        lastDiag,
        stallStacks
      }) + "\\n");
      return;
    }

    writeLastKillAt(now);
    writeStderr(JSON.stringify({
      level: 60,
      time: now,
      msg: "event_loop_watchdog_kill",
      label: LABEL,
      armReason,
      stalledMs,
      stallThresholdMs: STALL_MS,
      sinceLastKillMs: lastKillAt > 0 ? sinceLastKillMs : null,
      lastDiag,
      stallStacks
    }) + "\\n");
    // Persist forensics before we kill — survives the restart so the next
    // boot can name the stall's cause (lastDiag carries simDiagnostics).
    writeDeathForensics({
      deathKind: "watchdog_kill",
      at: now,
      stalledMs,
      lastDiag,
      stallStacks
    });
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

const parseNonNegativeNumber = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  const stackCaptureMs = options.stackCaptureMs ?? parseNonNegativeNumber(process.env.WATCHDOG_STACK_CAPTURE_MS, DEFAULT_STACK_CAPTURE_MS);
  const killStatePath =
    options.killStatePath ?? parseString(process.env.WATCHDOG_KILL_STATE_PATH, DEFAULT_KILL_STATE_PATH);
  const deathForensicsPath = options.deathForensicsPath ?? DEATH_FORENSICS_PATH;
  const label = options.label ?? "combined";

  const worker = new Worker(
    buildWorkerSource({ stallThresholdMs, bootGraceMs, minKillIntervalMs, stackCaptureMs, killStatePath, label, deathForensicsPath }),
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
      stackCaptureMs,
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
