import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";

// Every develop merge restarts the staging gateway + simulation for 1-2
// minutes. A player who signs in or taps "Enter the map" in that window must
// see a terse waiting state that recovers by itself, never a raw error, a
// server URL or a "reload the game" dead end. Only transport-level failures
// land here; AUTH_FAIL, a rejected name and other server answers keep their
// own error copy.
export const DEPLOY_WAIT_TITLE = "Server updating";
export const DEPLOY_WAIT_DETAIL = "Reconnecting…";
/** Inline status copy for taps that need a live session while it is down. */
export const DEPLOY_WAIT_STATUS = "Server updating — reconnecting…";
/** After this long offline the waiting card also offers a manual Retry. */
export const DEPLOY_WAIT_RETRY_AFTER_MS = 60_000;

const RETRY_BUTTON_ID = "auth-busy-retry";

type DeployWaitState = Pick<ClientState, "authBusy" | "authBusyTitle" | "authBusyDetail" | "authOfflineSince" | "connection">;

/** Anchors the offline window once per outage; recovery clears it. */
export const markAuthOffline = (state: Pick<ClientState, "authOfflineSince">, now: number = Date.now()): void => {
  if (state.authOfflineSince <= 0) state.authOfflineSince = now;
};

export const clearAuthOffline = (state: Pick<ClientState, "authOfflineSince">): void => {
  state.authOfflineSince = 0;
};

/** Puts the login overlay into the waiting state (busy, terse copy, no error). */
export const applyDeployWait = (state: DeployWaitState & Pick<ClientState, "authBusyStartedAt">, now: number = Date.now()): void => {
  state.authBusy = true;
  state.authBusyStartedAt = state.authBusyStartedAt || now;
  state.authBusyTitle = DEPLOY_WAIT_TITLE;
  state.authBusyDetail = DEPLOY_WAIT_DETAIL;
  markAuthOffline(state, now);
};

export const deployWaitRetryVisible = (state: DeployWaitState, now: number = Date.now()): boolean =>
  state.authBusy &&
  state.connection !== "initialized" &&
  state.authOfflineSince > 0 &&
  now - state.authOfflineSince >= DEPLOY_WAIT_RETRY_AFTER_MS;

/**
 * Manual fallback: reopen a dead transport now instead of waiting out the
 * backoff, or resend AUTH on a socket that opened but never got INIT.
 */
export const retryDeployWaitNow = (
  state: Pick<ClientState, "authOfflineSince">,
  ws: Pick<RealtimeSocket, "readyState" | "OPEN" | "reconnect">,
  authenticateSocket: (forceRefresh?: boolean) => Promise<void>,
  now: number = Date.now()
): void => {
  // Restart the window so the button steps aside while this attempt runs.
  state.authOfflineSince = now;
  if (ws.readyState === ws.OPEN) {
    void authenticateSocket(true);
    return;
  }
  ws.reconnect();
};

let resyncTimer: ReturnType<typeof setTimeout> | undefined;
const retryButtons = new WeakMap<HTMLElement, HTMLButtonElement>();

/**
 * Shows the Retry button on the waiting card once the outage passes
 * DEPLOY_WAIT_RETRY_AFTER_MS. The button is created here (not in the static
 * markup) so the login card's markup stays untouched.
 */
export const syncDeployWaitRetryButton = (deps: {
  state: DeployWaitState;
  modalEl: HTMLElement;
  onRetry: () => void;
  resync: () => void;
  now?: number;
}): void => {
  const { state, modalEl } = deps;
  const now = deps.now ?? Date.now();
  const visible = deployWaitRetryVisible(state, now);
  // Looked up only once it is due, so the quiet path never touches the DOM.
  let button = retryButtons.get(modalEl);
  if (!button && visible) {
    button = modalEl.ownerDocument.createElement("button");
    retryButtons.set(modalEl, button);
    button.id = RETRY_BUTTON_ID;
    button.type = "button";
    button.className = "panel-btn map-loading-btn";
    button.textContent = "Retry";
    const card = modalEl.querySelector(".auth-busy-card") ?? modalEl;
    card.appendChild(button);
  }
  if (button) {
    button.style.display = visible ? "" : "none";
    button.onclick = deps.onRetry;
  }
  if (resyncTimer !== undefined) {
    clearTimeout(resyncTimer);
    resyncTimer = undefined;
  }
  // Nothing else re-renders a quiet waiting card, so wake it when the
  // button is due.
  if (!visible && state.authBusy && state.connection !== "initialized" && state.authOfflineSince > 0) {
    const dueInMs = Math.max(0, state.authOfflineSince + DEPLOY_WAIT_RETRY_AFTER_MS - now);
    resyncTimer = setTimeout(() => {
      resyncTimer = undefined;
      deps.resync();
    }, dueInMs + 50);
  }
};
