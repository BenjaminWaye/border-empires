import { describe, expect, it } from "vitest";
import { applyInitActivitySeen } from "./client-activity-dashboard-init.js";

describe("applyInitActivitySeen", () => {
  it("reads INIT.activitySeen into state.activitySeen", () => {
    const state = { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" } };
    applyInitActivitySeen(state, { activitySeen: { lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" } });
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" });
  });

  it("leaves the existing watermark alone when INIT carries no activitySeen field", () => {
    const state = { activitySeen: { lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" } };
    applyInitActivitySeen(state, {});
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 500, lastActivitySeenSeasonId: "season-3" });
  });

  it("matches the fresh-player default of {0, \"\"} without throwing", () => {
    const state = { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" } };
    applyInitActivitySeen(state, { activitySeen: { lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" } });
    expect(state.activitySeen).toEqual({ lastActivitySeenAt: 0, lastActivitySeenSeasonId: "" });
  });
});
