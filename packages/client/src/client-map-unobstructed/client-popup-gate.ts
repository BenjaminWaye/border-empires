import { isNewPlayerStillOnboarding } from "../client-changelog/client-changelog.js";
import type { ClientState } from "../client-state/client-state.js";
import { isMapUnobstructed, type MapUnobstructedState } from "./client-map-unobstructed.js";

// Popups appended to <body> (waystation captured, shard rain alert) share
// or exceed the Activity dashboard's z-index, so showing one while the
// dashboard is open -- or just before it opens, since the dashboard waits on
// the personal-activity response -- paints it on top of What's New. Each
// popup holds itself until nothing else is open or about to open.

export type PopupGateState = MapUnobstructedState & Pick<ClientState, "guide"> & { activityDashboard: { open: boolean; loading: boolean } };

/** Upper bound on waiting for the personal-activity response, so a dropped request can't suppress a popup forever. */
export const POPUP_PENDING_DASHBOARD_GRACE_MS = 10_000;

/**
 * Returns a blocked-check with its own "dashboard pending since" clock, so
 * independent popups don't share (and reset) each other's grace window.
 */
export const createPopupBlockedCheck = (): { isBlocked: (state: PopupGateState, nowMs?: number) => boolean; reset: () => void } => {
  let pendingDashboardSince: number | null = null;
  /** The dashboard auto-opens for returning players once REQUEST_PERSONAL_ACTIVITY answers; until then it is pending. */
  const dashboardAboutToOpen = (state: PopupGateState, nowMs: number): boolean => {
    if (isNewPlayerStillOnboarding(state) || !state.activityDashboard.loading) {
      pendingDashboardSince = null;
      return false;
    }
    pendingDashboardSince ??= nowMs;
    return nowMs - pendingDashboardSince < POPUP_PENDING_DASHBOARD_GRACE_MS;
  };
  return {
    isBlocked: (state, nowMs = Date.now()) => !isMapUnobstructed(state) || dashboardAboutToOpen(state, nowMs),
    reset: () => {
      pendingDashboardSince = null;
    }
  };
};
