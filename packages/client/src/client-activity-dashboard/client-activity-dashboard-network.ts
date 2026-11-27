import type { PersonalActivityTimeline, WorldPulse } from "@border-empires/game-domain";
import { isFirstTimeVisitor, shouldShowClientChangelog } from "../client-changelog/client-changelog.js";
import { changelogAutoOpenPending, recordChangelogAutoOpened } from "../client-changelog/client-changelog-auto-open.js";
import type { ClientState } from "../client-state/client-state.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

type ActivityDashboardState = Pick<ClientState, "activityDashboard" | "activitySeen" | "changelog" | "authSessionReady" | "profileSetupRequired" | "bridgeDebugSeasonId" | "authEmail">;

type NetworkDeps = {
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  renderHud: () => void;
};

/**
 * How long a Chronicle fetch may stay in flight before the client gives up on
 * it. The gateway already answers a stalled sim RPC with an error after 10s
 * (handle-activity-timeline-messages.ts); this covers a request or answer the
 * socket itself lost, which would otherwise leave "Loading…" up forever.
 */
export const ACTIVITY_REQUEST_TIMEOUT_MS = 15_000;
export const ACTIVITY_LOAD_FAILED_MESSAGE = "Couldn't load your activity. Tap Yours to try again.";
export const WORLD_PULSE_LOAD_FAILED_MESSAGE = "Couldn't load world news. Tap World to try again.";

// One live request per feed: a timer from an older request never clears a newer one.
let personalActivityRequestSeq = 0;
let worldPulseRequestSeq = 0;

/**
 * Fetches the trailing-24h personal timeline. The server always scopes it to
 * the session player and "now" (packages/shared/src/messages/messages.ts) --
 * REQUEST_PERSONAL_ACTIVITY takes no payload. In-flight guarded the same way
 * REQUEST_TILE_DETAIL is (client-action-flow.ts) so repeated opens/refreshes
 * don't pile up duplicate requests. The guard always ends: an unsent request,
 * a dropped socket (releaseActivityRequestsOnDisconnect) or the timeout clear it.
 */
export const requestPersonalActivity = (state: ActivityDashboardState, deps: NetworkDeps): void => {
  if (state.activityDashboard.loading) return;
  state.activityDashboard.loading = true;
  state.activityDashboard.error = undefined;
  const seq = ++personalActivityRequestSeq;
  if (!deps.sendGameMessage({ type: "REQUEST_PERSONAL_ACTIVITY" }, "Finish sign-in before viewing your activity.")) {
    state.activityDashboard.loading = false;
    state.activityDashboard.error = ACTIVITY_LOAD_FAILED_MESSAGE;
    return;
  }
  setTimeout(() => {
    if (seq !== personalActivityRequestSeq || !state.activityDashboard.loading) return;
    state.activityDashboard.loading = false;
    state.activityDashboard.error = ACTIVITY_LOAD_FAILED_MESSAGE;
    deps.renderHud();
  }, ACTIVITY_REQUEST_TIMEOUT_MS);
};

export const requestWorldPulse = (state: ActivityDashboardState, deps: NetworkDeps): void => {
  if (state.activityDashboard.worldPulseLoading) return;
  state.activityDashboard.worldPulseLoading = true;
  state.activityDashboard.worldPulseError = undefined;
  const seq = ++worldPulseRequestSeq;
  if (!deps.sendGameMessage({ type: "REQUEST_WORLD_PULSE" }, "Finish sign-in before viewing the world pulse.")) {
    state.activityDashboard.worldPulseLoading = false;
    state.activityDashboard.worldPulseError = WORLD_PULSE_LOAD_FAILED_MESSAGE;
    return;
  }
  setTimeout(() => {
    if (seq !== worldPulseRequestSeq || !state.activityDashboard.worldPulseLoading) return;
    state.activityDashboard.worldPulseLoading = false;
    state.activityDashboard.worldPulseError = WORLD_PULSE_LOAD_FAILED_MESSAGE;
    deps.renderHud();
  }, ACTIVITY_REQUEST_TIMEOUT_MS);
};

/**
 * A closed socket loses any Chronicle request still in flight: its answer can
 * never arrive, and reconnects deliberately do not refetch. Release the
 * in-flight guards so reopening the tab asks again instead of waiting forever.
 */
export const releaseActivityRequestsOnDisconnect = (state: Pick<ClientState, "activityDashboard">): void => {
  const dash = state.activityDashboard;
  if (dash.loading) {
    dash.loading = false;
    dash.error = ACTIVITY_LOAD_FAILED_MESSAGE;
  }
  if (dash.worldPulseLoading) {
    dash.worldPulseLoading = false;
    dash.worldPulseError = WORLD_PULSE_LOAD_FAILED_MESSAGE;
  }
};

// capPersonalActivityCards (apps/simulation/.../personal-activity-cap.ts)
// always returns cards sorted newest-first, in both its branches -- so the
// newest card is always cards[0], not something to re-derive with a scan.
const newestCardAt = (timeline: PersonalActivityTimeline): number => timeline.cards[0]?.occurredAt ?? -1;

export const applyPersonalActivityTimelineMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.loading = false;
  const timeline = msg.timeline as PersonalActivityTimeline;
  state.activityDashboard.timeline = timeline;
  // Auto-open once per browser session (plan §2.1): never on a later
  // reconnect/refresh within the same session, even though this handler
  // fires again on every INIT -- autoOpenedThisSession only resets on a
  // fresh page load.
  const hasUnseenPersonalActivity = newestCardAt(timeline) > state.activitySeen.lastActivitySeenAt;
  // A season's first login never auto-opens the dashboard (What's New or Yours):
  // a fresh season has nothing to brief and the login is already crowded. The
  // season is recorded on the server (SET_HINT_STATE) so later logins -- on any
  // device -- open it normally; the Updates tab and unread badge still carry the
  // notes. An unknown season id never quiets.
  const seasonId = state.bridgeDebugSeasonId;
  const firstLoginOfSeason = Boolean(seasonId) && state.activityDashboard.quietedSeasonId !== seasonId;
  if (firstLoginOfSeason) {
    state.activityDashboard.quietedSeasonId = seasonId;
    sendHintStateUpdate({ dashboardQuietedSeasonId: seasonId });
  }
  // Brand-new players never get the dashboard stacked on their first load.
  if (isFirstTimeVisitor(state) || firstLoginOfSeason) {
    deps.renderHud();
    return;
  }
  if (!state.activityDashboard.autoOpenedThisSession && hasUnseenPersonalActivity) {
    state.activityDashboard.autoOpenedThisSession = true;
    state.activityDashboard.activeView = "YOURS";
    state.activityDashboard.open = true;
    requestWorldPulse(state, deps);
  } else if (
    !hasUnseenPersonalActivity &&
    !(state.activityDashboard.open && state.activityDashboard.activeView === "YOURS") &&
    !state.activityDashboard.updatesAutoOpenedThisSession &&
    shouldShowClientChangelog(state) &&
    changelogAutoOpenPending()
  ) {
    // Unseen release notes open the Chronicle too, but only once nothing in the
    // timeline is unread, and always on Yours: the Updates tab's badge points at
    // the notes, so a login never lands on the patch-notes tab. Opening on Yours
    // leaves the notes unseen, so a stored watermark stops the same notes from
    // reopening the Chronicle on every page load.
    state.activityDashboard.updatesAutoOpenedThisSession = true;
    recordChangelogAutoOpened();
    state.activityDashboard.activeView = "YOURS";
    state.activityDashboard.open = true;
    requestWorldPulse(state, deps);
  }
  deps.renderHud();
};

export const applyActivityTimelineErrorMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.loading = false;
  // The server's message is engineering text (e.g. "personal activity timeline
  // timed out after 10000ms"); the player gets the same retry hint as a client timeout.
  state.activityDashboard.error = ACTIVITY_LOAD_FAILED_MESSAGE;
  deps.renderHud();
};

export const applyWorldPulseMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.worldPulseLoading = false;
  state.activityDashboard.worldPulse = msg.pulse as WorldPulse;
  deps.renderHud();
};

export const applyWorldPulseErrorMessage = (msg: Record<string, unknown>, state: ActivityDashboardState, deps: NetworkDeps): void => {
  state.activityDashboard.worldPulseLoading = false;
  state.activityDashboard.worldPulseError = WORLD_PULSE_LOAD_FAILED_MESSAGE;
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
    // The Chronicle button's unread count reads the new watermark: redraw it now, not on the next unrelated refresh.
    deps.renderHud();
    return true;
  }
  if (msg.type === "WORLD_PULSE") {
    applyWorldPulseMessage(msg, state, deps);
    return true;
  }
  if (msg.type === "ERROR" && msg.code === "ACTIVITY_TIMELINE_UNAVAILABLE") {
    applyActivityTimelineErrorMessage(msg, state, deps);
    return true;
  }
  if (msg.type === "ERROR" && msg.code === "WORLD_PULSE_UNAVAILABLE") {
    applyWorldPulseErrorMessage(msg, state, deps);
    return true;
  }
  return false;
};
