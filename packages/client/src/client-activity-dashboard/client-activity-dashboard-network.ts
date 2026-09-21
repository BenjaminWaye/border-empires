import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";

type ActivityDashboardState = Pick<ClientState, "activityDashboard" | "activitySeen">;

type NetworkDeps = {
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  renderHud: () => void;
};

/**
 * Fetches the trailing-24h personal timeline. The server always scopes it to
 * the session player and "now" (packages/shared/src/messages/messages.ts) --
 * REQUEST_PERSONAL_ACTIVITY takes no payload. In-flight guarded the same way
 * REQUEST_TILE_DETAIL is (client-action-flow.ts) so repeated opens/refreshes
 * don't pile up duplicate requests.
 */
export const requestPersonalActivity = (state: ActivityDashboardState, deps: NetworkDeps): void => {
  if (state.activityDashboard.loading) return;
  state.activityDashboard.loading = true;
  state.activityDashboard.error = undefined;
  state.activityDashboard.requestedAt = Date.now();
  deps.sendGameMessage({ type: "REQUEST_PERSONAL_ACTIVITY" }, "Finish sign-in before viewing your activity.");
};

/** Newest card's occurredAt, or -1 if there are no cards (nothing to auto-open for). */
const newestCardAt = (timeline: PersonalActivityTimeline): number =>
  timeline.cards.reduce((max, card) => Math.max(max, card.occurredAt), -1);

export const applyPersonalActivityTimelineMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.loading = false;
  const timeline = msg.timeline as PersonalActivityTimeline;
  state.activityDashboard.timeline = timeline;
  // Auto-open once per browser session (plan §2.1): never on a later
  // reconnect/refresh within the same session, even though this handler
  // fires again on every INIT -- autoOpenedThisSession only resets on a
  // fresh page load.
  if (!state.activityDashboard.autoOpenedThisSession && newestCardAt(timeline) > state.activitySeen.lastActivitySeenAt) {
    state.activityDashboard.autoOpenedThisSession = true;
    state.activityDashboard.open = true;
  }
  deps.renderHud();
};

export const applyActivityTimelineErrorMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.loading = false;
  state.activityDashboard.error = typeof msg.message === "string" ? msg.message : "Couldn't load activity.";
  deps.renderHud();
};

/**
 * Opening "Yours" acknowledges the delivered timeline's watermark (plan §2.1).
 * `currentSeasonId` must be the player's live season (state.bridgeDebugSeasonId,
 * set from INIT/PLAYER_UPDATE), NOT state.activitySeen.lastActivitySeenSeasonId
 * -- that field only reflects the *last acknowledged* season, and the gateway
 * rejects an ack whose seasonId doesn't match its own current season
 * (ACTIVITY_SEEN_SEASON_MISMATCH), which a brand-new player's still-empty
 * lastActivitySeenSeasonId would always trigger.
 */
export const acknowledgeActivitySeen = (state: ActivityDashboardState, currentSeasonId: string, deps: NetworkDeps): void => {
  const timeline = state.activityDashboard.timeline;
  if (!timeline || !currentSeasonId) return;
  if (state.activityDashboard.acknowledgedFor >= timeline.to) return;
  state.activityDashboard.acknowledgedFor = timeline.to;
  deps.sendGameMessage({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: timeline.to, seasonId: currentSeasonId });
};

export const applyActivitySeenAcknowledgedMessage = (msg: Record<string, unknown>, state: ActivityDashboardState): void => {
  if (typeof msg.lastActivitySeenAt === "number") state.activitySeen.lastActivitySeenAt = msg.lastActivitySeenAt;
  if (typeof msg.lastActivitySeenSeasonId === "string") state.activitySeen.lastActivitySeenSeasonId = msg.lastActivitySeenSeasonId;
};

/**
 * Single entry point for client-network.ts's dispatch chain (mirrors how
 * other message-type clusters delegate to their own module). Returns true
 * when it handled the message, so the caller's `if (...) return;` stays a
 * one-liner instead of two multi-line branches inline in that oversized file.
 */
export const handleActivityDashboardMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): boolean => {
  if (msg.type === "PERSONAL_ACTIVITY_TIMELINE") {
    applyPersonalActivityTimelineMessage(msg, state, deps);
    return true;
  }
  if (msg.type === "ACTIVITY_SEEN_ACKNOWLEDGED") {
    applyActivitySeenAcknowledgedMessage(msg, state);
    return true;
  }
  if (msg.type === "ERROR" && msg.code === "ACTIVITY_TIMELINE_UNAVAILABLE") {
    applyActivityTimelineErrorMessage(msg, state, deps);
    return true;
  }
  return false;
};
