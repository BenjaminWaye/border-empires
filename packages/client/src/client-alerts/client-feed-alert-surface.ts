// The Alerts feed panel is only reachable from Settings > Admin (#2392), so a
// warn/error written only to the feed never reaches the player. This mirrors
// those entries onto the on-screen capture alert card, which every player
// sees. Info/success entries stay feed-only: they are confirmations of the
// player's own clicks whose effect is already visible in the UI.
//
// Rules, so the mirror never competes with purpose-built alerts:
// - Background notices that already have their own UI (muster combat reports,
//   incoming attacks, the event log, the diplomacy dock...) use severity info
//   or set FeedEntry.feedOnly.
// - It never replaces an alert raised explicitly via showCaptureAlert (a
//   combat result, a timeout with Report bug, a hostile-muster warning) while
//   that alert is still showing, matching client-persistent-alerts-frame.ts.
//   It may replace an earlier mirrored alert, so the latest rejection wins.
// - Mirrored alerts carry fromFeed so the battle screen does not mistake one
//   for a fight's outcome (client-hud-v2-battle-runtime.ts).
import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry, FeedType } from "../client-types.js";

export type FeedAlertSurfaceState = Partial<Pick<ClientState, "captureAlert">>;

/** Lifetime of every capture alert card (shared with showCaptureAlert). */
export const CAPTURE_ALERT_MS = 12_000;

const FEED_ALERT_TITLE: Record<FeedType, string> = {
  combat: "Combat",
  alliance: "Diplomacy",
  tech: "Research",
  mission: "Mission",
  error: "Error",
  info: "Notice"
};

export const surfaceFeedEntryAsAlert = (state: FeedAlertSurfaceState, entry: FeedEntry, nowMs = Date.now()): void => {
  if (entry.feedOnly || (entry.severity !== "warn" && entry.severity !== "error")) return;
  const current = state.captureAlert;
  if (current && current.until > nowMs && !current.fromFeed) return;
  state.captureAlert = {
    title: entry.title ?? FEED_ALERT_TITLE[entry.type],
    detail: entry.text,
    tone: entry.severity,
    fromFeed: true,
    until: nowMs + CAPTURE_ALERT_MS,
    ...(typeof entry.focusX === "number" && typeof entry.focusY === "number"
      ? { focusX: entry.focusX, focusY: entry.focusY, actionLabel: entry.actionLabel ?? "Center" }
      : {})
  };
};
