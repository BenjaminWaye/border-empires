// The Alerts feed panel is only reachable from Settings > Admin (#2392), so a
// warn/error written only to the feed never reaches the player. This mirrors
// those entries onto the on-screen capture alert card, which every player
// sees. Info/success entries stay feed-only: they are confirmations of the
// player's own clicks whose effect is already visible in the UI.
import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry, FeedType } from "../client-types.js";

export type FeedAlertSurfaceState = Partial<Pick<ClientState, "captureAlert">>;

/** Matches showCaptureAlert's lifetime (client-alerts.ts). */
export const FEED_SURFACED_ALERT_MS = 12_000;

/**
 * An alert raised this recently by the call site itself (e.g. the
 * showCaptureAlert + pushFeed pairs in showVisibleActionWarning) has a better
 * title than we can derive, so the feed mirror must not overwrite it.
 */
export const FEED_SURFACE_DEDUPE_MS = 1_500;

/**
 * Login backfills up to 24h of server event-log history into the feed
 * (seedFeedFromEventLog, entries stamped with their original occurredAt).
 * Those are history, not news, so an old TOWN_LOST must not pop up as a fresh
 * alert. Generous enough to tolerate client/server clock skew on live events.
 */
export const FEED_SURFACE_MAX_AGE_MS = 60_000;

const FEED_ALERT_TITLE: Record<FeedType, string> = {
  combat: "Combat",
  alliance: "Diplomacy",
  tech: "Research",
  mission: "Mission",
  error: "Error",
  info: "Notice"
};

const alertShownAt = (alert: NonNullable<ClientState["captureAlert"]>): number =>
  alert.shownAt ?? alert.until - FEED_SURFACED_ALERT_MS;

export const surfaceFeedEntryAsAlert = (state: FeedAlertSurfaceState, entry: FeedEntry, nowMs = Date.now()): void => {
  if (entry.severity !== "warn" && entry.severity !== "error") return;
  if (nowMs - entry.at > FEED_SURFACE_MAX_AGE_MS) return;
  const current = state.captureAlert;
  if (current && current.until > nowMs && nowMs - alertShownAt(current) < FEED_SURFACE_DEDUPE_MS) return;
  state.captureAlert = {
    title: entry.title ?? FEED_ALERT_TITLE[entry.type] ?? "Notice",
    detail: entry.text,
    tone: entry.severity,
    shownAt: nowMs,
    until: nowMs + FEED_SURFACED_ALERT_MS,
    ...(typeof entry.focusX === "number" && typeof entry.focusY === "number"
      ? { focusX: entry.focusX, focusY: entry.focusY, actionLabel: entry.actionLabel ?? "Center" }
      : {})
  };
};
