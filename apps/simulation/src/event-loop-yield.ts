// Yield helper for breaking up long synchronous loops on the main event loop.
//
// Use inside async functions to chunk per-N-iteration work so the loop can
// service other tasks (metric ticker, grpc dispatch, watchdog heartbeat)
// between chunks. The 2026-05-20 19:44 outage was a single buildPlayerSubscriptionSnapshot
// stalling the loop for 28s, which tripped the gateway watchdog SIGKILL.
//
// Implementation note: setImmediate is the canonical "yield to I/O" primitive;
// it runs queued callbacks after the current poll phase, ahead of timers.
// `await new Promise(r => setImmediate(r))` cedes a turn without scheduler trickery.
export const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

// Returns true on every Nth call (counter % chunkSize === 0, skipping zero).
// Helper for the common "yield every N iterations" pattern so the caller stays
// readable: `if (shouldYieldAt(i, 200)) await yieldToEventLoop();`.
export const shouldYieldAt = (counter: number, chunkSize: number): boolean =>
  counter > 0 && counter % chunkSize === 0;
