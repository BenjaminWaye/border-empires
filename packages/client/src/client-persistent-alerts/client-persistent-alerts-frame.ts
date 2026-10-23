import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { createHostileMusterAnnouncer, type HostileMusterNearBorder } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import { createPopupBlockedCheck } from "../client-map-unobstructed/client-popup-gate.js";
import { occupationSurveyController } from "../client-occupation-survey.js";
import type { ClientState } from "../client-state/client-state.js";
import { drawPersistentAlertLocators, persistentAlertsForState, type PersistentAlert } from "./client-persistent-alerts.js";

// Persistent-alert tile scan is O(all tiles ever discovered this session,
// up to WORLD_WIDTH*WORLD_HEIGHT) and measured at ~5.78ms avg / 20.5ms p99
// on mobile when run every frame. Town-unfed / muster-active status only
// changes on human timescales, so recomputing on a ~220ms cadence is
// visually lossless while cutting scan frequency by ~80-90%.
export const PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS = 220;

// After the map first has tiles, enemy flags already near the border are
// recorded without a toast for this long: tiles stream in over the first
// seconds, and a flag that has stood there for hours isn't news on login.
export const HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS = 15_000;

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
  let warmUpUntil: number | undefined;
  // The town-survey popup is held (not dropped) while What's New, the
  // Activity dashboard or the lobby is open or about to open.
  const surveyPopupGate = createPopupBlockedCheck();
  return (nowMs, drawDeps) => {
    occupationSurveyController.installViewHandler((report) => { state.camX = report.x; state.camY = report.y; });
    occupationSurveyController.sync({ camX: state.camX, camY: state.camY, camSubX: 0, camSubY: 0, selected: undefined, techIds: state.techIds ?? [], presentationReady: !surveyPopupGate.isBlocked(state, Date.now()) }, drawDeps.worldToScreen, drawDeps.size, drawDeps.halfW, drawDeps.halfH);
    if (computedAt === 0 || nowMs - computedAt >= PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS) {
      cache = persistentAlertsForState(state);
      computedAt = nowMs;
      if (warmUpUntil === undefined && state.me && state.tiles.size > 0) warmUpUntil = nowMs + HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS;
      const hostileMusters = cache.flatMap((alert): HostileMusterNearBorder[] => (alert.hostileMuster ? [alert.hostileMuster] : []));
      const announcement = hostileMusterAnnouncer.announce(hostileMusters, nowMs, {
        // Never stomp a toast that is still showing (a combat result, say);
        // pending flags wait until the toast slot frees up.
        canShow: !state.captureAlert || state.captureAlert.until <= Date.now(),
        silent: warmUpUntil === undefined || nowMs < warmUpUntil
      });
      if (announcement) showCaptureAlert(state, announcement.title, announcement.detail, announcement.tone, undefined, announcement.focus);
    }
    drawPersistentAlertLocators(state, { ...drawDeps, nowMs, precomputedAlerts: cache });
  };
};
