// Generic client-side pacing for bulk actions that would otherwise fire one
// network message per selected tile synchronously in a loop (bulk
// box-selection can cover up to 2500 tiles -- see client-drag-selection.ts).
//
// Most bulk actions (settle, attack) already avoid this by routing through
// the existing paced action/development queues (one command in flight at a
// time, gated on server ack). This helper covers the remaining "fire and
// forget" bulk actions (e.g. bulk collect) that send fire-and-forget
// messages with no server ack to gate on, so there's nothing to naturally
// pace them without this.
//
// Numbers here are deliberately conservative relative to the gateway's
// CommandRateLimiter (capacity 20, refill 5/sec, see
// apps/realtime-gateway/src/command-rate-limiter/command-rate-limiter.ts):
// an immediate burst under the capacity, then a steady drip slower than the
// refill rate, so a single bulk action never eats a player's entire budget
// and starves other in-flight commands (muster, settle, etc.).

export type PacedDispatchOptions = {
  /** How many items to send synchronously, right away. */
  immediateBurst: number;
  /** Spacing in ms between each subsequent send once the burst is exhausted. */
  intervalMs: number;
};

export const DEFAULT_PACED_BULK_DISPATCH_OPTIONS: PacedDispatchOptions = { immediateBurst: 15, intervalMs: 250 };

export const dispatchPaced = <T>(items: readonly T[], send: (item: T) => void, options: PacedDispatchOptions = DEFAULT_PACED_BULK_DISPATCH_OPTIONS): void => {
  const burst = items.slice(0, options.immediateBurst);
  const rest = items.slice(options.immediateBurst);
  for (const item of burst) send(item);
  rest.forEach((item, index) => {
    setTimeout(() => send(item), options.intervalMs * (index + 1));
  });
};
