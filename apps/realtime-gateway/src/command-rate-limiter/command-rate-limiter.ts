// Per-player token-bucket rate limiter for durable player commands (SETTLE,
// BUILD_*, CANCEL_*, MOVE_QUEUED_ENTRY_TO_FRONT, etc.) sent over the
// gateway websocket.
//
// Without this, nothing stops a buggy or malicious client from firing an
// unbounded flood of commands per second -- each one passes schema
// validation and idempotency/dedup (which only catches *repeated*
// commandId/clientSeq, not a fast-incrementing stream of *new* ones) and
// gets forwarded straight to the simulation over gRPC, one call per
// message, with no backpressure.
//
// This is deliberately a simple, dependency-free token bucket: capacity
// tokens available immediately (covers legitimate bursts -- e.g. bulk
// tile selection, or a client-local Planned queue promoting several
// entries into the server queue at once), refilling at a steady
// per-second rate afterward.
//
// State discipline (see docs/agents/state-and-persistence-discipline.md):
// this Map grows with connection count, not with command volume, and the
// caller MUST evict a player's entry via releasePlayer() once their last
// socket disconnects -- see the eviction call site in gateway-app.ts's
// socket "close" handler.

export type CommandRateLimiterOptions = {
  /** Max tokens (== max burst size) a single player can hold. */
  capacity: number;
  /** Tokens restored per second once below capacity. */
  refillPerSecond: number;
};

type BucketState = {
  tokens: number;
  lastRefillAtMs: number;
};

export type CommandRateLimitDecision = {
  allowed: boolean;
  /** Only set when allowed === false; how long until a token is available, for client/log messaging. */
  retryAfterMs?: number;
};

export class CommandRateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly options: CommandRateLimiterOptions) {}

  /** Number of distinct players currently tracked -- expose for a size gauge. */
  get trackedPlayerCount(): number {
    return this.buckets.size;
  }

  tryConsume(playerId: string, nowMs: number): CommandRateLimitDecision {
    const existing = this.buckets.get(playerId);
    const bucket: BucketState = existing ?? { tokens: this.options.capacity, lastRefillAtMs: nowMs };
    if (!existing) this.buckets.set(playerId, bucket);

    const elapsedSeconds = Math.max(0, nowMs - bucket.lastRefillAtMs) / 1000;
    bucket.tokens = Math.min(this.options.capacity, bucket.tokens + elapsedSeconds * this.options.refillPerSecond);
    bucket.lastRefillAtMs = nowMs;

    if (bucket.tokens < 1) {
      const tokensNeeded = 1 - bucket.tokens;
      const retryAfterMs = Math.ceil((tokensNeeded / this.options.refillPerSecond) * 1000);
      return { allowed: false, retryAfterMs };
    }

    bucket.tokens -= 1;
    return { allowed: true };
  }

  /** Call once a player has no remaining open sockets, so this Map doesn't grow unbounded across reconnects. */
  releasePlayer(playerId: string): void {
    this.buckets.delete(playerId);
  }
}

/**
 * Single chokepoint used by every durable command dispatch in gateway-app.ts.
 * Returns true (and sends a COMMAND_RATE_LIMITED error to the socket) if the
 * command should be dropped; false if it's fine to forward to the simulation.
 */
export const rejectIfCommandRateLimited = (args: {
  limiter: CommandRateLimiter;
  playerId: string;
  commandType: string;
  nowMs: number;
  socket: import("ws").WebSocket;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
}): boolean => {
  const decision = args.limiter.tryConsume(args.playerId, args.nowMs);
  if (decision.allowed) return false;
  args.recordGatewayEvent("warn", "gateway_command_throttled", {
    playerId: args.playerId,
    commandType: args.commandType,
    retryAfterMs: decision.retryAfterMs ?? 0
  });
  args.sendJson(args.socket, { type: "ERROR", code: "COMMAND_RATE_LIMITED", message: "command rate limit", retryAfterMs: decision.retryAfterMs ?? 0 });
  return true;
};
