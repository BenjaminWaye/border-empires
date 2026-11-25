import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({ updateProfile: vi.fn(async () => {}) }));

import { createProfileSubmitter } from "./client-auth-profile-submit.js";
import { createInitialState } from "../client-state/client-state.js";

// Regression (2026-11-25 playtest): tapping "Enter the map" while staging
// restarted for a deploy showed "Game server unavailable at wss://…", further
// taps did nothing, and the chosen name was lost on reload. The tap must wait
// for the session to come back and then found the empire with that choice.
const setup = (overrides: { readyState?: number; connection?: string } = {}) => {
  const state = createInitialState();
  state.authConfigured = true;
  state.authReady = true;
  state.authSessionReady = true;
  state.profileSetupRequired = true;
  state.connection = (overrides.connection ?? "disconnected") as typeof state.connection;
  const ws = { OPEN: 1, readyState: overrides.readyState ?? 3, send: vi.fn() };
  const setAuthStatus = vi.fn();
  const requireAuthedSession = vi.fn(() => false);
  const choice = { displayName: "Claire", color: "#ff8800" };
  const submitter = createProfileSubmitter({
    state,
    ws,
    firebaseAuth: { currentUser: { uid: "claire", displayName: "Claire" } as never },
    readChoice: () => ({ ...choice }),
    requireAuthedSession,
    setAuthBusy: (busy) => {
      state.authBusy = busy;
    },
    setAuthStatus,
    syncAuthOverlay: vi.fn()
  });
  return { state, ws, setAuthStatus, requireAuthedSession, choice, submitter };
};

describe("Enter the map during a deploy restart", () => {
  afterEach(() => vi.restoreAllMocks());

  it("holds the chosen name and colour while the server is down and sends them once INIT is back", async () => {
    const { state, ws, setAuthStatus, requireAuthedSession, submitter } = setup();

    await submitter.submitFromForm();

    expect(ws.send).not.toHaveBeenCalled();
    expect(requireAuthedSession).not.toHaveBeenCalled();
    expect(setAuthStatus).not.toHaveBeenCalledWith(expect.anything(), "error");
    expect(state.authBusy).toBe(true);
    expect(state.authBusyTitle).toBe("Server updating");

    // Socket reopened but INIT not yet in: SET_PROFILE would be NO_AUTH.
    ws.readyState = 1;
    state.connection = "connected";
    submitter.flushPending();
    expect(ws.send).not.toHaveBeenCalled();

    state.connection = "initialized";
    submitter.flushPending();
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] as string)).toEqual({ type: "SET_PROFILE", displayName: "Claire", color: "#ff8800" });

    // Sent once only.
    submitter.flushPending();
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it("still rejects a too-short name immediately", async () => {
    const { state, ws, setAuthStatus, choice, submitter } = setup();
    choice.displayName = "C";

    await submitter.submitFromForm();
    state.connection = "initialized";
    ws.readyState = 1;
    submitter.flushPending();

    expect(setAuthStatus).toHaveBeenCalledWith("Display name must be at least 2 characters.", "error");
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("sends right away on a live session", async () => {
    const { ws, submitter } = setup({ readyState: 1, connection: "initialized" });

    await submitter.submitFromForm();

    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it("drops a held choice when setup already finished", async () => {
    const { state, ws, submitter } = setup();
    await submitter.submitFromForm();

    state.profileSetupRequired = false;
    state.connection = "initialized";
    ws.readyState = 1;
    submitter.flushPending();

    expect(ws.send).not.toHaveBeenCalled();
  });
});
