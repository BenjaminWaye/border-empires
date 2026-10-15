import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { createHostileMusterAnnouncer, type HostileMusterNearBorder } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import type { ClientState } from "../client-state/client-state.js";
import { drawPersistentAlertLocators, persistentAlertsForState, type PersistentAlert } from "./client-persistent-alerts.js";

// Persistent-alert tile scan is O(all tiles ever discovered this session,
// up to WORLD_WIDTH*WORLD_HEIGHT) and measured at ~5.78ms avg / 20.5ms p99
// on mobile when run every frame. Town-unfed / muster-active status only
// changes on human timescales, so recomputing on a ~220ms cadence is
// visually lossless while cutting scan frequency by ~80-90%.
export const PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS = 220;

export type PersistentAlertsFrameDrawDeps = Omit<Parameters<typeof drawPersistentAlertLocators>[1], "nowMs" | "precomputedAlerts">;

/**
 * Per-frame persistent alert step for the runtime loop, shared by the 2D and
 * true-3D renderers (the locators are a HUD overlay on the 2D canvas either
 * way): recompute the alert list on its cadence, toast when an enemy muster
 * flag newly appears near the border, and draw the off-screen locators.
 */
export const createPersistentAlertsFrame = (
  state: ClientState
): ((nowMs: number, drawDeps: PersistentAlertsFrameDrawDeps) => void) => {
  let cache: PersistentAlert[] = [];
  let computedAt = 0;
  const hostileMusterAnnouncer = createHostileMusterAnnouncer();
  return (nowMs, drawDeps) => {
    if (computedAt === 0 || nowMs - computedAt >= PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS) {
      cache = persistentAlertsForState(state);
      computedAt = nowMs;
      // Never stomp a toast that is still showing (a combat result, say):
      // leave new flags unannounced until the toast slot frees up.
      if (!state.captureAlert || state.captureAlert.until <= Date.now()) {
        const hostileMusters = cache.flatMap((alert): HostileMusterNearBorder[] => (alert.hostileMuster ? [alert.hostileMuster] : []));
        const announcement = hostileMusterAnnouncer.announce(hostileMusters, nowMs);
        if (announcement) showCaptureAlert(state, announcement.title, announcement.detail, announcement.tone, undefined, announcement.focus);
      }
    }
    drawPersistentAlertLocators(state, { ...drawDeps, nowMs, precomputedAlerts: cache });
  };
};
