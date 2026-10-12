import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerHintStateSender } from "../client-discovery-tips/client-hint-server-sync.js";
import {
  acknowledgeActivitySeen,
  applyActivitySeenAcknowledgedMessage,
  applyPersonalActivityTimelineMessage,
  handleActivityDashboardMessage,
  requestPersonalActivity
} from "./client-activity-dashboard-network.js";

// Server-bound hint-state writes (SET_HINT_STATE) the handler reports.
const sentHintPatches: unknown[] = [];
beforeEach(() => {
  sentHintPatches.length = 0;
  registerHintStateSender((patch) => sentHintPatches.push(patch));
});
afterEach(() => registerHintStateSender(() => undefined));

const makeState = () => ({
  activityDashboard: {
    open: false,
    loading: false,
    timeline: undefined as any,
    error: undefined as string | undefined,
    activeView: "YOURS" as const,
    worldPulse: undefined,
    worldPulseLoading: false,
    worldPulseError: undefined as string | undefined,
    updatesAutoOpenedThisSession: false,
    quietedSeasonId: "season-1", // every test but the first-login ones models a later login in season-1
    acknowledgedFor: 0,
    autoOpenedThisSession: false,
    scrollTopByView: {},
    updatesBaselineSeenAt: undefined as number | undefined
  },
  activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" },
  changelog: { open: false, seenAt: Date.now(), scrollTop: 0 },
  authSessionReady: true,
  profileSetupRequired: false,
  bridgeDebugSeasonId: "season-1",
  authEmail: "a@example.com"
});

const timelineWith = (overrides: Partial<Record<string, unknown>> = {}) => ({
  playerId: "p1",
  from: 0,
  to: 1_000,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards: [],
  truncated: false,
  ...overrides
});

describe("requestPersonalActivity", () => {
  it("sends REQUEST_PERSONAL_ACTIVITY and sets loading", () => {
    const state = makeState();
    const sendGameMessage = vi.fn(() => true);
    requestPersonalActivity(state, { sendGameMessage, renderHud: vi.fn() });
    expect(state.activityDashboard.loading).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "REQUEST_PERSONAL_ACTIVITY" }, expect.any(String));
  });

  it("does not send a second request while one is already in flight", () => {
    const state = makeState();
    state.activityDashboard.loading = true;
    const sendGameMessage = vi.fn(() => true);
    requestPersonalActivity(state, { sendGameMessage, renderHud: vi.fn() });
    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});

describe("the dashboard on the first login of a season", () => {
  const firstLoginState = () => {
    const state = makeState();
    state.changelog.seenAt = 1; // returning player with release notes they have not read
    state.activityDashboard.quietedSeasonId = ""; // server has not recorded this season yet
    return state;
  };
  const deps = () => ({ sendGameMessage: vi.fn(), renderHud: vi.fn() });

  it("does not auto-open What's New, and records the season on the server", () => {
    const state = firstLoginState();
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(false);
    expect(state.activityDashboard.updatesAutoOpenedThisSession).toBe(false);
    expect(state.activityDashboard.quietedSeasonId).toBe("season-1");
    expect(sentHintPatches).toEqual([{ dashboardQuietedSeasonId: "season-1" }]);
  });

  it("does not auto-open the Yours briefing either, even with unseen activity", () => {
    const state = firstLoginState();
    state.activitySeen.lastActivitySeenAt = 500;
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 900 }] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(false);
    expect(state.activityDashboard.autoOpenedThisSession).toBe(false);
  });

  it("opens What's New on the next login in that season (server now holds the season)", () => {
    const state = firstLoginState();
    state.activityDashboard.quietedSeasonId = "season-1"; // INIT.player.dashboardQuietedSeasonId on the next login
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(true);
    expect(state.activityDashboard.activeView).toBe("UPDATES");
    expect(sentHintPatches).toEqual([]);
  });

  it("is quiet again on the first login of the following season", () => {
    const state = firstLoginState();
    state.activityDashboard.quietedSeasonId = "season-1";
    state.bridgeDebugSeasonId = "season-2";
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(false);
    expect(sentHintPatches).toEqual([{ dashboardQuietedSeasonId: "season-2" }]);
  });

  it("never quiets on an unknown season id", () => {
    const state = firstLoginState();
    state.bridgeDebugSeasonId = "";
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(true);
    expect(sentHintPatches).toEqual([]);
  });
});

describe("applyPersonalActivityTimelineMessage", () => {
  it("stores the timeline and clears loading", () => {
    const state = makeState();
    state.activityDashboard.loading = true;
    const renderHud = vi.fn();
    applyPersonalActivityTimelineMessage({ timeline: timelineWith() }, state, { sendGameMessage: vi.fn(), renderHud });
    expect(state.activityDashboard.loading).toBe(false);
    expect(state.activityDashboard.timeline).toBeDefined();
    expect(renderHud).toHaveBeenCalled();
  });

  it("auto-opens once per session when there is unseen activity newer than the watermark", () => {
    const state = makeState();
    state.activitySeen.lastActivitySeenAt = 500;
    const timeline = timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 900 }] });
    applyPersonalActivityTimelineMessage({ timeline }, state, { sendGameMessage: vi.fn(), renderHud: vi.fn() });
    expect(state.activityDashboard.open).toBe(true);
    expect(state.activityDashboard.autoOpenedThisSession).toBe(true);
  });

  it("never auto-opens for a first-time visitor (activity or release notes)", () => {
    const state = makeState();
    state.changelog.seenAt = 0;
    const timeline = timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 900 }] });
    const renderHud = vi.fn();
    applyPersonalActivityTimelineMessage({ timeline }, state, { sendGameMessage: vi.fn(), renderHud });
    expect(state.activityDashboard.open).toBe(false);
    expect(state.activityDashboard.autoOpenedThisSession).toBe(false);
    expect(state.activityDashboard.updatesAutoOpenedThisSession).toBe(false);
    expect(renderHud).toHaveBeenCalled();
  });

  it("does not auto-open a second time in the same session, even with newer activity", () => {
    const state = makeState();
    state.activityDashboard.autoOpenedThisSession = true;
    const timeline = timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 900 }] });
    applyPersonalActivityTimelineMessage({ timeline }, state, { sendGameMessage: vi.fn(), renderHud: vi.fn() });
    expect(state.activityDashboard.open).toBe(false);
  });

  it("does not auto-open when every card is already older than the watermark", () => {
    const state = makeState();
    state.activitySeen.lastActivitySeenAt = 1_000;
    const timeline = timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 500 }] });
    applyPersonalActivityTimelineMessage({ timeline }, state, { sendGameMessage: vi.fn(), renderHud: vi.fn() });
    expect(state.activityDashboard.open).toBe(false);
  });

  it("does not auto-open for an empty timeline", () => {
    const state = makeState();
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, state, { sendGameMessage: vi.fn(), renderHud: vi.fn() });
    expect(state.activityDashboard.open).toBe(false);
  });
});

describe("acknowledgeActivitySeen", () => {
  it("sends the timeline's `to` as seenAt with the current season id", () => {
    const state = makeState();
    state.activityDashboard.timeline = timelineWith({ to: 5_000 });
    const sendGameMessage = vi.fn(() => true);
    acknowledgeActivitySeen(state, "season-9", { sendGameMessage, renderHud: vi.fn() });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: 5_000, seasonId: "season-9" });
    expect(state.activityDashboard.acknowledgedFor).toBe(5_000);
  });

  it("is idempotent -- does not re-send once already acknowledged for this timeline", () => {
    const state = makeState();
    state.activityDashboard.timeline = timelineWith({ to: 5_000 });
    state.activityDashboard.acknowledgedFor = 5_000;
    const sendGameMessage = vi.fn(() => true);
    acknowledgeActivitySeen(state, "season-9", { sendGameMessage, renderHud: vi.fn() });
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("does nothing without a live current season id (avoids a guaranteed ACTIVITY_SEEN_SEASON_MISMATCH)", () => {
    const state = makeState();
    state.activityDashboard.timeline = timelineWith({ to: 5_000 });
    const sendGameMessage = vi.fn(() => true);
    acknowledgeActivitySeen(state, "", { sendGameMessage, renderHud: vi.fn() });
    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});

describe("applyActivitySeenAcknowledgedMessage", () => {
  it("updates the local watermark from the server's echoed values", () => {
    const state = makeState();
    applyActivitySeenAcknowledgedMessage({ lastActivitySeenAt: 5_000, lastActivitySeenSeasonId: "season-9" }, state);
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 5_000, lastActivitySeenSeasonId: "season-9" });
  });
});

describe("handleActivityDashboardMessage", () => {
  it("handles PERSONAL_ACTIVITY_TIMELINE and returns true", () => {
    const state = makeState();
    const handled = handleActivityDashboardMessage({ type: "PERSONAL_ACTIVITY_TIMELINE", timeline: timelineWith() }, state, {
      sendGameMessage: vi.fn(),
      renderHud: vi.fn()
    });
    expect(handled).toBe(true);
    expect(state.activityDashboard.timeline).toBeDefined();
  });

  it("handles ACTIVITY_SEEN_ACKNOWLEDGED and returns true", () => {
    const state = makeState();
    const handled = handleActivityDashboardMessage(
      { type: "ACTIVITY_SEEN_ACKNOWLEDGED", lastActivitySeenAt: 1, lastActivitySeenSeasonId: "s" },
      state,
      { sendGameMessage: vi.fn(), renderHud: vi.fn() }
    );
    expect(handled).toBe(true);
  });

  it("intercepts only its own ERROR code and clears loading", () => {
    const state = makeState();
    state.activityDashboard.loading = true;
    const handled = handleActivityDashboardMessage(
      { type: "ERROR", code: "ACTIVITY_TIMELINE_UNAVAILABLE", message: "nope" },
      state,
      { sendGameMessage: vi.fn(), renderHud: vi.fn() }
    );
    expect(handled).toBe(true);
    expect(state.activityDashboard.loading).toBe(false);
    expect(state.activityDashboard.error).toBe("nope");
  });

  it("leaves every other ERROR code unhandled, for the generic ERROR handler to process", () => {
    const state = makeState();
    const handled = handleActivityDashboardMessage({ type: "ERROR", code: "SOME_OTHER_ERROR" }, state, {
      sendGameMessage: vi.fn(),
      renderHud: vi.fn()
    });
    expect(handled).toBe(false);
  });

  it("returns false for unrelated message types", () => {
    const state = makeState();
    expect(handleActivityDashboardMessage({ type: "TILE_DELTA" }, state, { sendGameMessage: vi.fn(), renderHud: vi.fn() })).toBe(false);
  });
});
