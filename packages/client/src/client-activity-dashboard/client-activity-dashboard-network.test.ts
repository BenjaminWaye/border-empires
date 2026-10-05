// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeActivitySeen,
  applyActivitySeenAcknowledgedMessage,
  applyPersonalActivityTimelineMessage,
  handleActivityDashboardMessage,
  requestPersonalActivity
} from "./client-activity-dashboard-network.js";

// Every test except the first-login ones below models a later login in season-1.
beforeEach(() => {
  window.localStorage.setItem("be-whats-new-last-login-season:a@example.com", "season-1");
});

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
    acknowledgedFor: 0,
    autoOpenedThisSession: false,
    scrollTopByView: {},
    updatesBaselineSeenAt: undefined as number | undefined
  },
  activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" },
  changelog: { open: false, seenAt: Date.now(), scrollTop: 0 },
  guide: { completed: true },
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

describe("What's New on the first login of a season", () => {
  const unseenReleaseNotesState = () => {
    const state = makeState();
    state.changelog.seenAt = 0; // returning player with release notes they have not read
    return state;
  };
  const deps = () => ({ sendGameMessage: vi.fn(), renderHud: vi.fn() });

  it("does not auto-open on the first login of a season, but does on the next login in that season", () => {
    window.localStorage.clear();
    const first = unseenReleaseNotesState();
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, first, deps());
    expect(first.activityDashboard.open).toBe(false);
    expect(first.activityDashboard.updatesAutoOpenedThisSession).toBe(false);

    const second = unseenReleaseNotesState(); // next page load, same season
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, second, deps());
    expect(second.activityDashboard.open).toBe(true);
    expect(second.activityDashboard.activeView).toBe("UPDATES");
  });

  it("is quiet again on the first login of the following season", () => {
    window.localStorage.clear();
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, unseenReleaseNotesState(), deps());
    const nextSeason = unseenReleaseNotesState();
    nextSeason.bridgeDebugSeasonId = "season-2";
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [] }) }, nextSeason, deps());
    expect(nextSeason.activityDashboard.open).toBe(false);
  });

  it("still opens the personal briefing on a season's first login", () => {
    window.localStorage.clear();
    const state = unseenReleaseNotesState();
    state.activitySeen.lastActivitySeenAt = 500;
    applyPersonalActivityTimelineMessage({ timeline: timelineWith({ cards: [{ kind: "COMBAT", occurredAt: 900 }] }) }, state, deps());
    expect(state.activityDashboard.open).toBe(true);
    expect(state.activityDashboard.activeView).toBe("YOURS");
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

  it("never auto-opens for a new player who hasn't finished the tutorial (activity or release notes)", () => {
    const state = makeState();
    state.guide.completed = false;
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
