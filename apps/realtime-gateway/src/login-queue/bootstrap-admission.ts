// Admission gate for the prepare+subscribe bootstrap unit.
//
// PreparePlayer + subscribePlayer together form a single expensive unit of
// work on the (single-threaded) simulation process. This gate must run
// BEFORE both of them so that an over-capacity situation throttles at the
// very start of the AUTH handler, not partway through it (which would let
// PreparePlayer run unthrottled while only subscribePlayer was gated).
//
// Callers MUST invoke `release()` on every exit path once `admitBootstrap`
// returns `{ granted: true }` — success, prepare failure, subscribe failure,
// or any thrown error. Failing to do so leaks a permanent slot: capacity
// drifts toward zero and all future logins queue forever.
import type { LoginQueue } from "./login-queue.js";

export type BootstrapAdmissionMetrics = {
  incrementLoginQueuedTotal: (count?: number) => void;
  incrementLoginQueueRejectedTotal: (count?: number) => void;
};

export type BootstrapAdmissionDeps = {
  bootstrapsInFlight: () => number;
  incrementBootstrapsInFlight: () => void;
  decrementBootstrapsInFlight: () => void;
  maxConcurrentBootstraps: number;
  minBootstrapIntervalMs: number;
  lastBootstrapAtByPlayerId: Map<string, number>;
  maxLoginQueueSize: number;
  loginQueue: LoginQueue;
  gatewayMetrics: BootstrapAdmissionMetrics;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  now?: () => number;
};

export type BootstrapAdmissionRejection = {
  granted: false;
  reason: "rate" | "queue_full" | "queue_socket_closed";
};

export type BootstrapAdmissionGrant = {
  granted: true;
  bootstrapNowMs: number;
  // Must be called exactly once, on every exit path, once granted.
  release: () => void;
};

export type BootstrapAdmissionResult = BootstrapAdmissionRejection | BootstrapAdmissionGrant;

// Attempts to admit one bootstrap (prepare+subscribe) unit for `playerId`.
// Applies a per-player rate limit, then a global concurrency cap backed by
// `loginQueue` (holds the socket open and resumes it when a slot frees up).
export const admitBootstrap = async (
  playerId: string,
  channel: string,
  socket: import("ws").WebSocket,
  deps: BootstrapAdmissionDeps
): Promise<BootstrapAdmissionResult> => {
  const now = deps.now ?? Date.now;
  const bootstrapNowMs = now();
  const lastBootstrapAtMs = deps.lastBootstrapAtByPlayerId.get(playerId) ?? 0;
  const overConcurrency = deps.bootstrapsInFlight() >= deps.maxConcurrentBootstraps;
  const overRate = bootstrapNowMs - lastBootstrapAtMs < deps.minBootstrapIntervalMs;

  if (overRate) {
    deps.recordGatewayEvent("warn", "gateway_bootstrap_admission_rejected", {
      playerId,
      channel,
      reason: "rate",
      bootstrapsInFlight: deps.bootstrapsInFlight(),
      maxConcurrentBootstraps: deps.maxConcurrentBootstraps
    });
    deps.sendJson(socket, {
      type: "ERROR",
      code: "SERVER_BUSY",
      retryAfterMs: 4000 + Math.floor(Math.random() * 4000),
      message: "Server is busy. Retry shortly."
    });
    return { granted: false, reason: "rate" };
  }

  if (overConcurrency) {
    if (deps.loginQueue.size() >= deps.maxLoginQueueSize) {
      deps.gatewayMetrics.incrementLoginQueueRejectedTotal();
      deps.recordGatewayEvent("warn", "gateway_bootstrap_admission_rejected", {
        playerId,
        channel,
        reason: "queue_full",
        bootstrapsInFlight: deps.bootstrapsInFlight(),
        maxConcurrentBootstraps: deps.maxConcurrentBootstraps,
        queueDepth: deps.loginQueue.size()
      });
      deps.sendJson(socket, {
        type: "ERROR",
        code: "SERVER_BUSY",
        retryAfterMs: 4000 + Math.floor(Math.random() * 4000),
        message: "Server is busy. Retry shortly."
      });
      return { granted: false, reason: "queue_full" };
    }

    deps.gatewayMetrics.incrementLoginQueuedTotal();
    const queuePosition = deps.bootstrapsInFlight() + deps.loginQueue.size() + 1;
    const estimatedWaitMs = deps.loginQueue.estimatedWaitMs(deps.loginQueue.size() + 1);
    deps.recordGatewayEvent("info", "gateway_bootstrap_queued", {
      playerId,
      channel,
      position: queuePosition,
      queueDepth: deps.loginQueue.size()
    });
    deps.sendJson(socket, { type: "LOGIN_QUEUED", position: queuePosition, estimatedWaitMs });
    const granted = await deps.loginQueue.enqueueAndWait(socket);
    if (!granted) {
      // Socket closed while queued: no slot was ever taken, nothing to release.
      return { granted: false, reason: "queue_socket_closed" };
    }
  }

  if (deps.lastBootstrapAtByPlayerId.size > 5000) deps.lastBootstrapAtByPlayerId.clear();
  deps.lastBootstrapAtByPlayerId.set(playerId, bootstrapNowMs);
  deps.incrementBootstrapsInFlight();

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    deps.decrementBootstrapsInFlight();
    deps.loginQueue.drain();
  };

  return { granted: true, bootstrapNowMs, release };
};
