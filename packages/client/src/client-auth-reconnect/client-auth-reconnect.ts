import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import { recordClientDebugEvent } from "../client-debug/client-debug.js";
import { applyDeployWait, DEPLOY_WAIT_DETAIL } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";

type AuthReconnectSchedulerDeps = {
  state: ClientState;
  ws: RealtimeSocket;
  firebaseAuth?: { currentUser?: unknown };
  setAuthBusy: (busy: boolean) => void;
  setAuthStatus: (message: string, tone?: "error") => void;
  syncAuthOverlay: () => void;
  renderHud: () => void;
  authenticateSocket: (forceRefresh?: boolean) => Promise<void>;
};

export type AuthReconnectScheduler = {
  clear: () => void;
  resetAttempt: () => void;
  schedule: (message: string, forceRefresh?: boolean) => void;
};

export const createAuthReconnectScheduler = (deps: AuthReconnectSchedulerDeps): AuthReconnectScheduler => {
  const { state, ws, firebaseAuth, setAuthBusy, setAuthStatus, syncAuthOverlay, renderHud, authenticateSocket } = deps;
  let timer: number | undefined;
  let attempt = 0;

  const clear = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    state.authRetryNextAt = 0;
  };

  const resetAttempt = (): void => {
    attempt = 0;
    state.authRetryAttempt = 0;
    state.authRetryNextAt = 0;
  };

  const schedule = (message: string, forceRefresh = false): void => {
    clear();
    if (!state.authRetrying || state.authRetryAttempt <= 0) attempt = 0;
    setAuthBusy(true);
    attempt += 1;
    state.authRetrying = true;
    state.authRetryAttempt = attempt;
    const baseDelayMs = Math.min(16000, 2000 * 2 ** Math.min(3, attempt - 1));
    const delayMs = Math.round(baseDelayMs * (0.5 + Math.random()));
    state.authRetryNextAt = Date.now() + delayMs;
    state.authBusyDetail = `${message} Attempt ${attempt} starts in ${Math.ceil(delayMs / 1000)}s.`;
    setAuthStatus(message);
    syncAuthOverlay();
    renderHud();
    recordClientDebugEvent("info", "auth-progress", "retry-scheduled", {
      attempt,
      delayMs,
      forceRefresh,
      wsReadyState: ws.readyState,
      connection: state.connection
    });
    timer = window.setTimeout(() => {
      timer = undefined;
      state.authRetryNextAt = 0;
      if (!firebaseAuth?.currentUser || state.authSessionReady) return;
      if (ws.readyState !== ws.OPEN) {
        // The transport dropped while waiting (usually a deploy restart).
        // Wait and reopen in place; the socket's "open" handler resends AUTH.
        applyDeployWait(state);
        state.authRetrying = false;
        resetAttempt();
        setAuthStatus(DEPLOY_WAIT_DETAIL);
        if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) ws.reconnect();
        syncAuthOverlay();
        renderHud();
        return;
      }
      state.authBusyTitle = "Securing session";
      state.authBusyDetail = `Retry ${attempt}: sending Google session for ${state.authUserLabel || "your empire"}...`;
      recordClientDebugEvent("info", "auth-progress", "phase", { title: state.authBusyTitle, detail: state.authBusyDetail, wsReadyState: ws.readyState, connection: state.connection });
      console.info("[auth-progress] phase", { title: state.authBusyTitle, detail: state.authBusyDetail, wsReadyState: ws.readyState, connection: state.connection });
      void authenticateSocket(forceRefresh).catch((error: unknown) => {
        setAuthBusy(false);
        state.authRetrying = false;
        resetAttempt();
        setAuthStatus(error instanceof Error ? error.message : "Could not reconnect to the game server.", "error");
        syncAuthOverlay();
        renderHud();
      });
    }, delayMs);
  };

  return { clear, resetAttempt, schedule };
};
