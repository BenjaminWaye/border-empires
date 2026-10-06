import { createPopupBlockedCheck, POPUP_PENDING_DASHBOARD_GRACE_MS, type PopupGateState } from "../client-map-unobstructed/client-popup-gate.js";
import { showWaystationActivationOverlay, type WaystationActivationInfo } from "./client-waystation-activation.js";

// The activation popup shares z-index 32 with the Activity dashboard; see
// client-popup-gate.ts for why it waits until What's New is gone.

export type WaystationPopupGateState = PopupGateState;

export const WAYSTATION_POPUP_PENDING_DASHBOARD_GRACE_MS = POPUP_PENDING_DASHBOARD_GRACE_MS;
const RECHECK_INTERVAL_MS = 400;

const gate = createPopupBlockedCheck();
let pendingInfo: WaystationActivationInfo | null = null;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;

/** Test-only: drops any held popup and timers. */
export const resetWaystationPopupGateForTests = (): void => {
  pendingInfo = null;
  gate.reset();
  if (recheckTimer !== null) clearTimeout(recheckTimer);
  recheckTimer = null;
};

export const isWaystationPopupBlocked = (state: WaystationPopupGateState, nowMs: number = Date.now()): boolean => gate.isBlocked(state, nowMs);

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
