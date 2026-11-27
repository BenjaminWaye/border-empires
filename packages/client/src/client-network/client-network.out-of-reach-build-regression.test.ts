import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Regression (2026-11 staging playtest, tile 573,300): Build on an owned FRONTIER
// tile outside reach queues the build and sends SETTLE first. The sim refused the
// SETTLE as OUT_OF_REACH, but the queued build stayed, so every later Build click
// said "Build already queued" while all build slots were free.
describe("OUT_OF_REACH refusal of a garrison with a build queued behind it", () => {
  it("drops the queued build and the garrison attempt, with plain copy", () => {
    const state = Object.assign(createInitialState(), createState());
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.latestSettleTargetKey = "573,300";
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 573, y: 300, tileKey: "573,300", label: "Garrison at (573, 300)" };
    state.autoSettleTargets = new Set<string>();
    state.autoBuildTargets = new Map<string, string>([["573,300", "HYDROGARDEN"]]);
    state.queuedDevelopmentDispatchPending = true;
    const showCaptureAlert = vi.fn();
    const ws = new FakeWebSocket();
    const { clearOptimisticTileState } = bindWithDeps(state, ws, { showCaptureAlert });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "OUT_OF_REACH", message: "tile is outside your reach" }) });
      expect(state.autoBuildTargets.has("573,300")).toBe(false);
      expect(state.lastDevelopmentAttempt).toBeUndefined();
      expect(state.queuedDevelopmentDispatchPending).toBe(false);
      expect(clearOptimisticTileState).toHaveBeenCalledWith("573,300", true);
      expect(showCaptureAlert.mock.calls[0]?.[0]).toBe("Outside your reach");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("leaves another tile's queued build alone when the refusal was for a different garrison", () => {
    const state = Object.assign(createInitialState(), createState());
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.latestSettleTargetKey = "573,300";
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 573, y: 300, tileKey: "573,300", label: "Garrison at (573, 300)" };
    state.autoBuildTargets = new Map<string, string>([["573,300", "HYDROGARDEN"], ["580,300", "HYDROGARDEN"]]);
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, { showCaptureAlert: vi.fn() });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "OUT_OF_REACH", message: "tile is outside your reach" }) });
      expect(state.autoBuildTargets.has("580,300")).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
