// Client-side pacing for durable commands, so the player never sees the
// gateway's COMMAND_RATE_LIMITED rejection. The gateway allows a burst of
// COMMAND_RATE_LIMIT_CAPACITY commands then COMMAND_RATE_LIMIT_REFILL_PER_SECOND
// per second; a bulk action (Garrison Many: one DEV_QUEUE_ENQUEUE per tile plus
// the first SETTLE) easily exceeds that in one tick. Instead of firing and
// having the overflow dropped, this mirrors the bucket (with headroom, since the
// gateway measures at arrival and network jitter can bunch paced sends) and
// holds the excess in a FIFO, releasing each command once the gateway would
// accept it. If the gateway rejects one anyway (another tab sharing the
// player's bucket), it echoes the rejected message and we re-send it, in order.
//
// State discipline: `pending`/`retries` are bounded (maxPending) and entries
// expire after COMMAND_PACER_STALE_MS while the connection is unusable;
// `retryAttempts` is capped at COMMAND_PACER_RECENT_LIMIT keys.
import { COMMAND_RATE_LIMIT_CAPACITY, COMMAND_RATE_LIMIT_REFILL_PER_SECOND, isRateLimitedCommandType } from "@border-empires/shared";

/** Burst tokens held back from the gateway's capacity to absorb send/arrival jitter. */
export const COMMAND_PACER_HEADROOM = 4;
/** Fraction of the gateway's refill rate we send at, for the same reason. */
export const COMMAND_PACER_REFILL_FRACTION = 0.8;
export const COMMAND_PACER_MAX_PENDING = 200;
/** A command still waiting this long for the connection to come back is dropped (a reconnect resyncs). */
export const COMMAND_PACER_STALE_MS = 15_000;
/** How often a waiting backlog re-checks a connection that isn't ready. */
export const COMMAND_PACER_NOT_READY_RECHECK_MS = 500;
/** A command the gateway keeps rejecting is re-sent at most this many times. */
export const COMMAND_PACER_MAX_RETRIES = 3;
export const COMMAND_PACER_RECENT_LIMIT = 64;

export type CommandPacerDeps = {
  /** Writes to the socket. Only called when isReady() (deferred sends) or by the caller's own checks (immediate). */
  deliver: (payload: unknown) => void;
  /** Whether a command that had to wait can be written now. */
  isReady: () => boolean;
  now?: () => number;
  schedule?: (fn: () => void, delayMs: number) => unknown;
  capacity?: number;
  refillPerSecond?: number;
  maxPending?: number;
};

export type CommandPacer = {
  /** Sends now, or queues behind earlier paced commands. False only if the backlog is full. */
  send: (payload: unknown) => boolean;
  /**
   * The gateway throttled us: stop sending until retryAfterMs passes and re-send
   * `rejected` (the message it echoed) ahead of the backlog. Returns false when
   * there is nothing to re-send or it has already been retried too often.
   */
  noteServerThrottle: (retryAfterMs: number, rejected?: unknown) => boolean;
  pendingCount: () => number;
};

type PendingCommand = { payload: unknown; queuedAt: number };

const typeOf = (payload: unknown): unknown => (payload && typeof payload === "object" ? (payload as { type?: unknown }).type : undefined);

export const createCommandPacer = (deps: CommandPacerDeps): CommandPacer => {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? ((fn: () => void, delayMs: number) => setTimeout(fn, delayMs));
  const capacity = Math.max(1, (deps.capacity ?? COMMAND_RATE_LIMIT_CAPACITY) - COMMAND_PACER_HEADROOM);
  const refillPerMs = ((deps.refillPerSecond ?? COMMAND_RATE_LIMIT_REFILL_PER_SECOND) * COMMAND_PACER_REFILL_FRACTION) / 1000;
  const maxPending = deps.maxPending ?? COMMAND_PACER_MAX_PENDING;
  // Re-sends of gateway-rejected commands go before new ones, in rejection order.
  const retries: PendingCommand[] = [];
  const pending: PendingCommand[] = [];
  const retryAttempts = new Map<string, number>();
  let tokens = capacity;
  let lastRefillAt = now();
  let blockedUntil = 0;
  let timerArmed = false;

  const backlog = (): number => retries.length + pending.length;
  const refill = (): void => {
    const at = now();
    tokens = Math.min(capacity, tokens + Math.max(0, at - lastRefillAt) * refillPerMs);
    lastRefillAt = at;
  };
  const arm = (delayMs?: number): void => {
    if (timerArmed || backlog() === 0) return;
    timerArmed = true;
    schedule(flush, delayMs ?? Math.max(blockedUntil - now(), Math.ceil((1 - tokens) / refillPerMs), 1));
  };
  const dropStale = (queue: PendingCommand[]): void => {
    const cutoff = now() - COMMAND_PACER_STALE_MS;
    while (queue.length > 0 && (queue[0]?.queuedAt ?? 0) < cutoff) queue.shift();
  };
  const flush = (): void => {
    timerArmed = false;
    if (!deps.isReady()) {
      // Auth refresh / reconnect in progress: keep waiting, but not forever.
      dropStale(retries);
      dropStale(pending);
      arm(COMMAND_PACER_NOT_READY_RECHECK_MS);
      return;
    }
    refill();
    while (backlog() > 0 && tokens >= 1 && now() >= blockedUntil) {
      const next = retries.shift() ?? pending.shift();
      if (!next) break;
      tokens -= 1;
      deps.deliver(next.payload);
    }
    arm();
  };

  const send = (payload: unknown): boolean => {
    if (!isRateLimitedCommandType(typeOf(payload))) {
      deps.deliver(payload);
      return true;
    }
    refill();
    if (backlog() === 0 && tokens >= 1 && now() >= blockedUntil) {
      tokens -= 1;
      deps.deliver(payload);
      return true;
    }
    if (backlog() >= maxPending) return false;
    pending.push({ payload, queuedAt: now() });
    arm();
    return true;
  };

  const noteServerThrottle = (retryAfterMs: number, rejected?: unknown): boolean => {
    refill();
    tokens = 0;
    blockedUntil = Math.max(blockedUntil, now() + Math.max(0, retryAfterMs));
    let requeued = false;
    if (isRateLimitedCommandType(typeOf(rejected))) {
      const key = JSON.stringify(rejected);
      const attempts = (retryAttempts.get(key) ?? 0) + 1;
      retryAttempts.delete(key);
      if (attempts <= COMMAND_PACER_MAX_RETRIES) {
        retryAttempts.set(key, attempts);
        while (retryAttempts.size > COMMAND_PACER_RECENT_LIMIT) {
          const oldest = retryAttempts.keys().next().value;
          if (oldest === undefined) break;
          retryAttempts.delete(oldest);
        }
        retries.push({ payload: rejected, queuedAt: now() });
        requeued = true;
      }
    }
    arm();
    return requeued;
  };

  return { send, noteServerThrottle, pendingCount: backlog };
};

// One pacer per socket, shared by every send path (action flow, tech/domain
// picks, crystal abilities) and the ERROR handler (client-network) without
// threading it through bootstrap. A WeakMap, so a discarded socket takes its
// pacer with it.
type PacedSocket = { send: (data: string) => void; readyState?: number; OPEN?: number };
type SocketPacer = { pacer: CommandPacer; isReady: () => boolean };
const pacersBySocket = new WeakMap<PacedSocket, SocketPacer>();

const socketPacer = (ws: PacedSocket): SocketPacer => {
  const existing = pacersBySocket.get(ws);
  if (existing) return existing;
  const entry: SocketPacer = {
    isReady: () => ws.OPEN === undefined || ws.readyState === ws.OPEN,
    pacer: createCommandPacer({
      deliver: (payload) => ws.send(JSON.stringify(payload)),
      isReady: () => entry.isReady()
    })
  };
  pacersBySocket.set(ws, entry);
  return entry;
};

/**
 * Send `payload` on `ws`, pacing rate-limited command types under the gateway's
 * bucket. `isReady` (when given) replaces the socket's readiness check that is
 * applied before a command that had to wait is written; callers that have the
 * full session state (client-action-flow) pass it, others inherit it.
 */
export const pacedSocketSend = (ws: PacedSocket, payload: unknown, isReady?: () => boolean): boolean => {
  const entry = socketPacer(ws);
  if (isReady) entry.isReady = isReady;
  return entry.pacer.send(payload);
};

/**
 * Server ERROR codes that must never reach the player as an "Action failed"
 * popup. Returns true when the error was fully handled here; false lets the
 * generic handler clean up (and word it for players).
 */
export const handleSilentServerError = (ws: PacedSocket, code: string, msg: Record<string, unknown>): boolean => {
  // Dev/waypoint-queue mirroring re-sends an enqueue the server already has
  // (dedup); a real full queue is already prevented client-side.
  if (code === "DEV_QUEUE_FULL" || code === "WAYPOINT_QUEUE_FULL") return true;
  if (code !== "COMMAND_RATE_LIMITED") return false;
  // The pacer normally keeps us under the limit; this is e.g. another tab
  // sharing the player's bucket. Back off and re-send the rejected command.
  const retryAfterMs = typeof msg.retryAfterMs === "number" ? msg.retryAfterMs : 1000;
  return socketPacer(ws).pacer.noteServerThrottle(retryAfterMs, msg.rejected);
};
