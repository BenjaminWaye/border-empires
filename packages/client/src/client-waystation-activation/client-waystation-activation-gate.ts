import { isNewPlayerStillOnboarding } from "../client-changelog/client-changelog.js";
import { isMapUnobstructed, type MapUnobstructedState } from "../client-map-unobstructed/client-map-unobstructed.js";
import type { ClientState } from "../client-state/client-state.js";
import { showWaystationActivationOverlay, type WaystationActivationInfo } from "./client-waystation-activation.js";

// The activation popup shares z-index 32 with the Activity dashboard (What's
// New / personal briefing) and is appended to <body> later, so showing it
// while the dashboard is open -- or just before the dashboard opens, since
// the dashboard waits on the personal-activity response -- paints it on top
// of What's New. Hold the popup until nothing else is open or about to open.

export type WaystationPopupGateState = MapUnobstructedState & Pick<ClientState, "guide"> & { activityDashboard: { open: boolean; loading: boolean } };

/** Upper bound on waiting for the personal-activity response, so a dropped request can't suppress the popup forever. */
export const WAYSTATION_POPUP_PENDING_DASHBOARD_GRACE_MS = 10_000;
const RECHECK_INTERVAL_MS = 400;

let pendingInfo: WaystationActivationInfo | null = null;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDashboardSince: number | null = null;

/** Test-only: drops any held popup and timers. */
export const resetWaystationPopupGateForTests = (): void => {
  pendingInfo = null;
  pendingDashboardSince = null;
  if (recheckTimer !== null) clearTimeout(recheckTimer);
  recheckTimer = null;
};

/** The dashboard auto-opens for returning players once REQUEST_PERSONAL_ACTIVITY answers; until then it is pending. */
const dashboardAboutToOpen = (state: WaystationPopupGateState, nowMs: number): boolean => {
  if (isNewPlayerStillOnboarding(state) || !state.activityDashboard.loading) {
    pendingDashboardSince = null;
    return false;
  }
  pendingDashboardSince ??= nowMs;
  return nowMs - pendingDashboardSince < WAYSTATION_POPUP_PENDING_DASHBOARD_GRACE_MS;
};

export const isWaystationPopupBlocked = (state: WaystationPopupGateState, nowMs: number = Date.now()): boolean =>
  !isMapUnobstructed(state) || dashboardAboutToOpen(state, nowMs);

const flush = (state: WaystationPopupGateState): void => {
  recheckTimer = null;
  if (!pendingInfo) return;
  if (isWaystationPopupBlocked(state)) {
    recheckTimer = setTimeout(() => flush(state), RECHECK_INTERVAL_MS);
    return;
  }
  const info = pendingInfo;
  pendingInfo = null;
  showWaystationActivationOverlay(info);
};

/**
 * Shows the activation popup now, or holds it (latest wins, matching how a
 * second popup replaces the first) until the dashboard/tutorial/lobby is gone.
 */
export const showWaystationActivationOverlayWhenClear = (info: WaystationActivationInfo, state: WaystationPopupGateState): void => {
  if (!isWaystationPopupBlocked(state)) {
    showWaystationActivationOverlay(info);
    return;
  }
  pendingInfo = info;
  if (recheckTimer === null) recheckTimer = setTimeout(() => flush(state), RECHECK_INTERVAL_MS);
};
