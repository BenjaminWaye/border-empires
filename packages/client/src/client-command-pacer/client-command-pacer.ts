// Client-side pacing for durable commands, so the player never sees the
// gateway's COMMAND_RATE_LIMITED rejection. The gateway allows a burst of
// COMMAND_RATE_LIMIT_CAPACITY commands then COMMAND_RATE_LIMIT_REFILL_PER_SECOND
// per second; a bulk action (Garrison Many: one DEV_QUEUE_ENQUEUE per tile plus
// the first SETTLE) easily exceeds that in one tick. Instead of firing and
// having the overflow dropped, this mirrors the bucket (with a little headroom
// for network jitter) and holds the excess in a FIFO, releasing each command
// as soon as the gateway would accept it.
//
// State discipline: `pending` is bounded by maxPending and emptied whenever the
// connection isn't usable at flush time (a reconnect resyncs queues from the
// server), so it can't grow without bound.
import { COMMAND_RATE_LIMIT_CAPACITY, COMMAND_RATE_LIMIT_REFILL_PER_SECOND, isRateLimitedCommandType } from "@border-empires/shared";

/** Burst tokens held back from the gateway's capacity to absorb send/arrival jitter. */
export const COMMAND_PACER_HEADROOM = 2;
export const COMMAND_PACER_MAX_PENDING = 200;
/** Recently delivered paced commands kept (by commandId) so a gateway rejection can be re-sent, not lost. */
export const COMMAND_PACER_RECENT_LIMIT = 64;

export type CommandPacerDeps = {
  /** Actually writes to the socket; returns false if the connection can't take it right now. */
  deliver: (payload: unknown) => boolean;
  now?: () => number;
  schedule?: (fn: () => void, delayMs: number) => unknown;
  capacity?: number;
  refillPerSecond?: number;
  maxPending?: number;
};

export type CommandPacer = {
  /** Sends now, or queues behind earlier paced commands. False only if the backlog is full or delivery failed. */
  send: (payload: unknown) => boolean;
  /**
   * The gateway throttled us anyway (e.g. another tab sharing the bucket): stop
   * sending until retryAfterMs passes, and re-send the rejected command (named by
   * commandId) first. Returns true if that command was found and re-queued.
   */
  noteServerThrottle: (retryAfterMs: number, commandId?: string) => boolean;
  pendingCount: () => number;
};

export const createCommandPacer = (deps: CommandPacerDeps): CommandPacer => {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? ((fn: () => void, delayMs: number) => setTimeout(fn, delayMs));
  const capacity = Math.max(1, (deps.capacity ?? COMMAND_RATE_LIMIT_CAPACITY) - COMMAND_PACER_HEADROOM);
  const refillPerMs = (deps.refillPerSecond ?? COMMAND_RATE_LIMIT_REFILL_PER_SECOND) / 1000;
  const maxPending = deps.maxPending ?? COMMAND_PACER_MAX_PENDING;
  const pending: unknown[] = [];
  let tokens = capacity;
  let lastRefillAt = now();
  let blockedUntil = 0;
  let timerArmed = false;
  const recent = new Map<string, unknown>();

  const deliverPaced = (payload: unknown): boolean => {
    const commandId = (payload as { commandId?: unknown }).commandId;
    if (typeof commandId === "string" && commandId) {
      recent.delete(commandId);
      recent.set(commandId, payload);
      while (recent.size > COMMAND_PACER_RECENT_LIMIT) {
        const oldest = recent.keys().next().value;
        if (oldest === undefined) break;
        recent.delete(oldest);
      }
    }
    return deps.deliver(payload);
  };

  const refill = (): void => {
    const at = now();
    tokens = Math.min(capacity, tokens + Math.max(0, at - lastRefillAt) * refillPerMs);
    lastRefillAt = at;
  };
  const waitMs = (): number => Math.max(blockedUntil - now(), Math.ceil((1 - tokens) / refillPerMs), 1);
  const arm = (): void => {
    if (timerArmed || pending.length === 0) return;
    timerArmed = true;
    schedule(flush, waitMs());
  };
  const flush = (): void => {
    timerArmed = false;
    refill();
    while (pending.length > 0 && tokens >= 1 && now() >= blockedUntil) {
      const payload = pending.shift();
      tokens -= 1;
      // Connection gone while this waited: drop the backlog -- reconnect resyncs
      // the dev/waypoint queues, and a stale command shouldn't fire on a new session.
      if (!deliverPaced(payload)) { pending.length = 0; return; }
    }
    arm();
  };

  const send = (payload: unknown): boolean => {
    const type = payload && typeof payload === "object" ? (payload as { type?: unknown }).type : undefined;
    if (!isRateLimitedCommandType(type)) return deps.deliver(payload);
    refill();
    if (pending.length === 0 && tokens >= 1 && now() >= blockedUntil) {
      tokens -= 1;
      return deliverPaced(payload);
    }
    if (pending.length >= maxPending) return false;
    pending.push(payload);
    arm();
    return true;
  };

  const noteServerThrottle = (retryAfterMs: number, commandId?: string): boolean => {
    refill();
    tokens = 0;
    blockedUntil = Math.max(blockedUntil, now() + Math.max(0, retryAfterMs));
    const rejected = commandId ? recent.get(commandId) : undefined;
    if (commandId) recent.delete(commandId);
    if (rejected !== undefined) pending.unshift(rejected);
    arm();
    return rejected !== undefined;
  };

  return { send, noteServerThrottle, pendingCount: () => pending.length };
};

// One pacer per socket, shared by the send path (client-action-flow) and the
// ERROR handler (client-network) without threading it through bootstrap. A
// WeakMap, so a discarded socket takes its pacer with it.
type PacedSocket = { send: (data: string) => void };
const pacersBySocket = new WeakMap<PacedSocket, CommandPacer>();

/**
 * Send `payload` on `ws`, pacing rate-limited command types under the gateway's
 * bucket. `isReady` is re-checked before a command that had to wait is written.
 */
export const pacedSocketSend = (ws: PacedSocket, payload: unknown, isReady: () => boolean): boolean => {
  let pacer = pacersBySocket.get(ws);
  if (!pacer) {
    let deferred = false;
    const created = createCommandPacer({
      deliver: (next) => {
        if (deferred && !isReady()) return false;
        ws.send(JSON.stringify(next));
        return true;
      },
      schedule: (fn, delayMs) => setTimeout(() => { deferred = true; try { fn(); } finally { deferred = false; } }, delayMs)
    });
    pacersBySocket.set(ws, created);
    pacer = created;
  }
  return pacer.send(payload);
};

/**
 * Server ERROR codes that must never reach the player as an "Action failed"
 * popup. Returns true when the error was fully handled here.
 */
export const handleSilentServerError = (ws: PacedSocket, code: string, msg: Record<string, unknown>): boolean => {
  // Dev/waypoint-queue mirroring re-sends an enqueue the server already has
  // (dedup); a real full queue is already prevented client-side.
  if (code === "DEV_QUEUE_FULL" || code === "WAYPOINT_QUEUE_FULL") return true;
  if (code !== "COMMAND_RATE_LIMITED") return false;
  // The pacer normally keeps us under the limit; this is another tab sharing the
  // player's bucket. Back off and re-send the rejected command rather than drop it.
  const retryAfterMs = typeof msg.retryAfterMs === "number" ? msg.retryAfterMs : 1000;
  const commandId = typeof msg.commandId === "string" ? msg.commandId : undefined;
  pacersBySocket.get(ws)?.noteServerThrottle(retryAfterMs, commandId);
  return true;
};
