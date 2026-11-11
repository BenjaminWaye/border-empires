import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { cancelQueuedBuild } from "../client-queue-reorder/client-queue-reorder.js";
import { cancelGarrisonFollowUpBuild } from "./client-cancel-queued-auto-settle.js";

// Regression: Cancel garrison left the tile's queued build behind, so it still
// showed as queued and went up once the tile was garrisoned again.
describe("cancelGarrisonFollowUpBuild", () => {
  it("drops the garrison+build continuation and the tile's queued dev-queue build", () => {
    const state = createInitialState();
    state.me = "me";
    state.autoSettleTargets.add("10,10");
    state.autoBuildTargets.set("10,10", "FORT");
    state.developmentQueue = [
      { kind: "BUILD", x: 10, y: 10, tileKey: "10,10", label: "Fort at (10, 10)", payload: { type: "BUILD_STRUCTURE", x: 10, y: 10, structureType: "FORT" }, optimisticKind: "FORT" },
      { kind: "BUILD", x: 11, y: 10, tileKey: "11,10", label: "Fort at (11, 10)", payload: { type: "BUILD_STRUCTURE", x: 11, y: 10, structureType: "FORT" }, optimisticKind: "FORT" }
    ];
    const sendGameMessage = vi.fn(() => true);

    cancelGarrisonFollowUpBuild(state, "10,10", (tileKey) => cancelQueuedBuild(state, tileKey, { pushFeed: vi.fn(), renderHud: vi.fn(), sendGameMessage }));

    expect(state.autoSettleTargets.has("10,10")).toBe(false);
    expect(state.autoBuildTargets.has("10,10")).toBe(false);
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["11,10"]);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_CANCEL", tileKey: "10,10" });
  });
});
