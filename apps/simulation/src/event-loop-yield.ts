// Yield helper for breaking up long synchronous loops on the main event loop.
//
// Use inside async functions to chunk per-N-iteration work so the loop can
// service other tasks (metric ticker, grpc dispatch, watchdog heartbeat)
// between chunks. The 2026-05-20 19:44 outage was a single buildPlayerSubscriptionSnapshot
// stalling the loop for 28s, which tripped the gateway watchdog SIGKILL.
//
// Implementation note: setImmediate fires in the Check phase of the Node.js
// event loop (timers → pending callbacks → idle → poll → CHECK → close).
// I/O callbacks (gRPC dispatch) fire in the poll phase, so they're processed
// BEFORE setImmediate.  setTimeout(fn, 0) fires in the timers phase, which
// runs BEFORE the check phase — so a pending setTimeout(0) always runs before
// the next setImmediate callback in the same iteration.
//
// Background drain scheduling (AI/system commands) uses setImmediate so that
// snapshot-build yields (also setImmediate) register their continuations first,
// ensuring snapshot chunks run ahead of drains in each iteration.  This
// prevents AI drains from stalling login snapshots (the 26 s login regression).
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
