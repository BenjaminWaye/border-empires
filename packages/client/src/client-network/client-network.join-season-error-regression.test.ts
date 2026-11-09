import { describe, expect, it, vi } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

const emitError = (ws: FakeWebSocket, code: string, message: string): void => {
  ws.emit("message", { data: JSON.stringify({ type: "ERROR", code, message }) });
};

describe("client network join-season ERROR handling", () => {
  it("clears the Joining... state and redraws on JOIN_SEASON_FAILED (regression: endless loading)", () => {
    const state = createState();
    Object.assign(state, { joinSeasonPending: true, joinSeasonOverlayOpen: true, needsSeasonJoin: true });
    const ws = new FakeWebSocket();
    const renderHud = vi.fn();
    bindWithDeps(state, ws, { renderHud });
    emitError(ws, "JOIN_SEASON_FAILED", "Could not join the season. Try again.");
    expect(state.joinSeasonPending).toBe(false);
    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(renderHud).toHaveBeenCalled();
  });

  it("closes the join prompt on JOIN_SEASON_ENDED", () => {
    const state = createState();
    Object.assign(state, { joinSeasonPending: true, joinSeasonOverlayOpen: true, needsSeasonJoin: true });
    const ws = new FakeWebSocket();
    const renderHud = vi.fn();
    bindWithDeps(state, ws, { renderHud });
    emitError(ws, "JOIN_SEASON_ENDED", "This season has ended. You can join the next one when it starts.");
    expect(state.joinSeasonPending).toBe(false);
    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(renderHud).toHaveBeenCalled();
  });

  it("leaves a frontier SEASON_ENDED rejection to the generic action-failure handling", () => {
    const state = createState();
    Object.assign(state, { joinSeasonOverlayOpen: true, needsSeasonJoin: true });
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);
    emitError(ws, "SEASON_ENDED", "The season has ended.");
    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(state.needsSeasonJoin).toBe(true);
    expect(state.actionInFlight).toBe(false);
    expect(deps.processActionQueue).toHaveBeenCalled();
  });
});
