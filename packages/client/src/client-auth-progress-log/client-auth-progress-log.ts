import { recordClientDebugEvent } from "../client-debug/client-debug.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";

const AUTH_PROGRESS_INTERVAL_MS = 5000;

type AuthProgressLogState = Pick<
  ClientState,
  | "authBusy"
  | "authSessionReady"
  | "authBusyStartedAt"
  | "authRetryNextAt"
  | "connection"
  | "authBusyTitle"
  | "authBusyDetail"
  | "authRetrying"
  | "authRetryAttempt"
>;

/**
 * Every 5s while login is busy, records an "auth-progress waiting" debug
 * event (in the diagnostics bundle) with the overlay text and socket state.
 * Extracted from client-network.ts.
 */
export const startAuthProgressLogger = (state: AuthProgressLogState, ws: Pick<RealtimeSocket, "readyState">): void => {
  if (typeof globalThis.setInterval !== "function") return;
  const intervalId = globalThis.setInterval(() => {
    if (!state.authBusy || state.authSessionReady || state.authBusyStartedAt <= 0) return;
    const elapsedMs = Date.now() - state.authBusyStartedAt;
    const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const retryInSec = state.authRetryNextAt > 0 ? Math.max(0, Math.ceil((state.authRetryNextAt - Date.now()) / 1000)) : 0;
    const payload = {
      elapsedSec,
      connection: state.connection,
      title: state.authBusyTitle,
      detail: state.authBusyDetail,
      authRetrying: state.authRetrying,
      authRetryAttempt: state.authRetryAttempt,
      retryInSec,
      wsReadyState: ws.readyState
    };
    recordClientDebugEvent("info", "auth-progress", "waiting", payload);
    console.info("[auth-progress] waiting", payload);
  }, AUTH_PROGRESS_INTERVAL_MS);
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(
      "beforeunload",
      () => {
        globalThis.clearInterval(intervalId);
      },
      { once: true }
    );
  }
};
