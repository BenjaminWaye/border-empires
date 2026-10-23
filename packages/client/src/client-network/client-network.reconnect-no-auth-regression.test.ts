import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, bindWithDeps, createState } from "./client-network.error-regression.test-helpers.js";

// Regression for a staging report (2026-10-21): reconnecting after a server
// update popped "Action failed — Error NO_AUTH: auth first". The reopened
// socket sent a chunk subscribe before AUTH; the gateway answered NO_AUTH,
// which tore down authSessionReady mid-handshake and toasted as an action
// failure.
describe("client network NO_AUTH during in-place reconnect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const emitNoAuth = (ws: FakeWebSocket): void => {
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "NO_AUTH", message: "auth first" }) });
  };

  it("ignores a NO_AUTH that raced AUTH on a reopened socket", () => {
    const state = createState();
    state.connection = "connected";
    const showCaptureAlert = vi.fn();
    const setAuthStatus = vi.fn();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, { showCaptureAlert, setAuthStatus });
    vi.spyOn(console, "error").mockImplementation(() => {});

    emitNoAuth(ws);

    expect(state.authSessionReady).toBe(true);
    expect(setAuthStatus).not.toHaveBeenCalledWith("auth first", "error");
    expect(showCaptureAlert).not.toHaveBeenCalled();
  });

  it("still drops the session on NO_AUTH once INIT has landed, without an action toast", () => {
    const state = createState();
    state.connection = "initialized";
    const showCaptureAlert = vi.fn();
    const setAuthStatus = vi.fn();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, { showCaptureAlert, setAuthStatus });
    vi.spyOn(console, "error").mockImplementation(() => {});

    emitNoAuth(ws);

    expect(state.authSessionReady).toBe(false);
    expect(setAuthStatus).toHaveBeenCalledWith("auth first", "error");
    expect(showCaptureAlert).not.toHaveBeenCalled();
  });
});
