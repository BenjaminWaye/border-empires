import type { ClientState } from "../client-state/client-state.js";
import { DEPLOY_WAIT_DETAIL } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";
import { deployCountdownLabel } from "../client-deploy-countdown/client-deploy-countdown.js";
import { isMapLoadingOverlayActive } from "../client-map-loading-view/client-map-loading-view.js";

// In game, a command sent while the realtime session is down (usually a
// deploy restart) can never reach the server. sendGameMessage already refused
// it, but only on the hidden sign-in status line, so the player saw a planned
// Explore close as if it had launched and nothing happen. Say so instead.
export const OFFLINE_COMMAND_TITLE = "Server updating";
/** Background senders can retry quickly; one notice per this window is enough. */
const NOTICE_THROTTLE_MS = 4_000;

type ReconnectOverlayState = Parameters<typeof isMapLoadingOverlayActive>[0];
type OfflineGuardState = Pick<ClientState, "hasEverInitialized" | "connection"> &
  Partial<Pick<ClientState, "deployStatus">> &
  ReconnectOverlayState;

// The reconnect overlay ("Disconnected from server") already tells the player
// the session is down; a second "Server updating" card under it reads as a
// stacked, buggy double overlay (playtest 2026-11-28).
const reconnectOverlayShowing = (state: OfflineGuardState, now: number): boolean => isMapLoadingOverlayActive(state, now);

export type OfflineAlert = (title: string, detail: string, tone?: "success" | "error" | "warn") => void;

/** True for an in-game player whose session is not live (sign-in keeps its own copy). */
export const gameCommandsOffline = (state: OfflineGuardState): boolean =>
  state.hasEverInitialized && state.connection !== "initialized";

const lastNoticeAt = new WeakMap<object, number>();

/**
 * Returns true (and shows a short notice) when a game command must be refused
 * because the session is down. Callers must not apply or keep any optimistic
 * result of a refused command.
 */
export const blockOfflineGameCommand = (state: OfflineGuardState, showAlert: OfflineAlert, now: number = Date.now()): boolean => {
  if (!gameCommandsOffline(state)) return false;
  if (reconnectOverlayShowing(state, now)) return true;
  if (now - (lastNoticeAt.get(state) ?? Number.NEGATIVE_INFINITY) >= NOTICE_THROTTLE_MS) {
    lastNoticeAt.set(state, now);
    showAlert(OFFLINE_COMMAND_TITLE, deployCountdownLabel(state, now) ?? DEPLOY_WAIT_DETAIL, "warn");
  }
  return true;
};

/**
 * Expires a "Server updating" notice once the reconnect overlay covers the
 * same news, or once the session is live again (a reconnect inside the
 * overlay's grace window would otherwise leave it saying "Reconnecting…").
 * Expiring rather than deleting lets the card renderer arm its late-tap guard.
 */
export const dropOfflineNoticeUnderReconnectOverlay = (
  state: OfflineGuardState & Pick<ClientState, "captureAlert">,
  now: number = Date.now()
): void => {
  const alert = state.captureAlert;
  if (alert?.title !== OFFLINE_COMMAND_TITLE || alert.until <= now) return;
  if (!gameCommandsOffline(state) || reconnectOverlayShowing(state, now)) alert.until = now;
};
