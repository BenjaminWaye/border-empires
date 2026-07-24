import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";

// After this many failed in-place reconnect attempts, fall back to a hard
// page reload (the old behavior) rather than backing off forever — a real
// outage should still eventually resolve via the full boot sequence.
const MAX_INPLACE_RECONNECT_ATTEMPTS = 5;

type InPlaceReconnectDeps = {
  state: ClientState;
  ws: RealtimeSocket;
};

export type InPlaceReconnectScheduler = {
  clear: () => void;
  resetAttempt: () => void;
  schedule: () => void;
};

// Recovers a dropped socket by reconnecting in place (ws.reconnect()) with
// bounded exponential backoff, instead of the old window.location.reload()
// on every drop — which redid the whole boot sequence (asset refetch,
// Firebase re-init, a fresh AUTH round trip) and lost camera position. Only
// falls back to a reload after MAX_INPLACE_RECONNECT_ATTEMPTS failures.
export const createInPlaceReconnectScheduler = (deps: InPlaceReconnectDeps): InPlaceReconnectScheduler => {
  const { state, ws } = deps;
  let timer: number | undefined;
  let attempt = 0;

  const clear = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const resetAttempt = (): void => {
    attempt = 0;
  };

  const schedule = (): void => {
    if (!state.hasEverInitialized) return;
    if (timer !== undefined) return;
    attempt += 1;
    if (attempt > MAX_INPLACE_RECONNECT_ATTEMPTS) {
      window.location.reload();
      return;
    }
    const baseDelayMs = Math.min(16000, 2000 * 2 ** Math.min(3, attempt - 1));
    const delayMs = Math.round(baseDelayMs * (0.5 + Math.random()));
    timer = window.setTimeout(() => {
      timer = undefined;
      if (state.connection === "initialized" || state.connection === "connected") return;
      ws.reconnect();
    }, delayMs);
  };

  // Backgrounded tabs are the most common way this socket dies (OS/browser
  // suspends the connection while hidden), and schedule()'s passive path only
  // notices once the browser delivers a "close" event plus a backoff wait.
  // Checking immediately on return removes that lag instead of waiting for
  // whatever's left of the current backoff delay.
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (!state.hasEverInitialized) return;
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) return;
      clear();
      ws.reconnect();
    });
  }

  return { clear, resetAttempt, schedule };
};
