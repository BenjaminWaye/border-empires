import { describe, expect, it } from "vitest";
import { applyInitActivitySeen } from "./client-activity-dashboard-init.js";

describe("applyInitActivitySeen quieted season", () => {
  const stateWith = () => ({ activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" }, activityDashboard: { quietedSeasonId: "" } });

  it("reads INIT.player.dashboardQuietedSeasonId", () => {
    const state = stateWith();
    applyInitActivitySeen(state, { player: { dashboardQuietedSeasonId: "season-3" } });
    expect(state.activityDashboard.quietedSeasonId).toBe("season-3");
  });

  it("keeps the existing value when INIT carries none", () => {
    const state = stateWith();
    state.activityDashboard.quietedSeasonId = "season-2";
    applyInitActivitySeen(state, { player: {} });
    expect(state.activityDashboard.quietedSeasonId).toBe("season-2");
  });
});

describe("applyInitActivitySeen", () => {
  it("reads INIT.activitySeen into state.activitySeen", () => {
    const state = { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" }, activityDashboard: { quietedSeasonId: "" } };
    applyInitActivitySeen(state, { activitySeen: { lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" } });
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" });
  });

  it("leaves the existing watermark alone when INIT carries no activitySeen field", () => {
    const state = { activitySeen: { lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" }, activityDashboard: { quietedSeasonId: "" } };
    applyInitActivitySeen(state, {});
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" });
  });

  it("matches the fresh-player default of {0, \"\"} without throwing", () => {
    const state = { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" }, activityDashboard: { quietedSeasonId: "" } };
    applyInitActivitySeen(state, { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" } });
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" });
  });
});
