import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";

// A transport can open without ever delivering INIT (or stop during the
// download). Retry if restoration makes no progress for a minute. Queue
// updates and INIT chunks extend this deadline so slow, active logins survive.
const RECOVERY_PROGRESS_TIMEOUT_MS = 60_000;

type InPlaceReconnectDeps = {
  state: ClientState;
  ws: RealtimeSocket;
  onStalled?: () => void;
};

export type InPlaceReconnectScheduler = {
  clear: () => void;
  resetAttempt: () => void;
  schedule: () => void;
  watchForRecovery: () => void;
};

// Recovers a dropped socket by reconnecting in place (ws.reconnect()) with
// bounded exponential backoff. Outages can outlast any fixed attempt budget;
// keep the current page and its view instead of repeatedly reloading it.
export const createInPlaceReconnectScheduler = (deps: InPlaceReconnectDeps): InPlaceReconnectScheduler => {
  const { state, ws } = deps;
  let timer: number | undefined;
  let recoveryTimer: number | undefined;
  let attempt = 0;

  const clearRecoveryTimer = (): void => {
    if (recoveryTimer !== undefined) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
    }
  };

  const clear = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    clearRecoveryTimer();
  };

  const resetAttempt = (): void => {
    clear();
    attempt = 0;
  };

  const watchForRecovery = (): void => {
    clear();
    if (!state.hasEverInitialized || state.connection === "initialized" || !deps.onStalled) return;
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = undefined;
      if (state.connection !== "initialized") deps.onStalled?.();
    }, RECOVERY_PROGRESS_TIMEOUT_MS);
  };

  const schedule = (): void => {
    clearRecoveryTimer();
    if (!state.hasEverInitialized) return;
    if (timer !== undefined) return;
    attempt = Math.min(4, attempt + 1);
    const baseDelayMs = Math.min(16000, 2000 * 2 ** Math.min(3, attempt - 1));
    const delayMs = Math.round(baseDelayMs * (0.5 + Math.random()));
    timer = window.setTimeout(() => {
      timer = undefined;
      if (state.connection === "initialized") return;
      ws.reconnect();
      watchForRecovery();
    }, delayMs);
  };

  // Backgrounded tabs are the most common way this socket dies (OS/browser
  // suspends the connection while hidden), and schedule()'s passive path only
  // notices once the browser delivers a "close" event plus a backoff wait.
  // Checking immediately on return removes that lag instead of waiting for
  // whatever's left of the current backoff delay.
  const reconnectIfStillDown = (): void => {
    if (!state.hasEverInitialized) return;
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) return;
    clear();
    ws.reconnect();
    watchForRecovery();
  };

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      reconnectIfStillDown();
    });

    // Chrome's Page Lifecycle API can outright freeze a hidden tab's JS
    // execution after a few minutes backgrounded — a stronger step than
    // visibilitychange, which only reports show/hide and says nothing about
    // whether the page was actually still running while hidden. This is
    // usually what kills a long-backgrounded socket. "resume" fires the
    // moment execution restarts, so wire it up as a second, more direct
    // trigger alongside visibilitychange. Chrome/Edge only; unsupported
    // browsers simply never fire it, leaving visibilitychange to cover them.
    document.addEventListener("resume", reconnectIfStillDown);
  }

  return { clear, resetAttempt, schedule, watchForRecovery };
};
