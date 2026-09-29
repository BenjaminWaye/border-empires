import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({ signOut: vi.fn(async () => undefined), signInAnonymously: vi.fn(), getAdditionalUserInfo: vi.fn() }));

import { signOut } from "firebase/auth";

import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

const sendError = (ws: FakeWebSocket, code: string, message: string): void => {
  ws.emit("message", { data: JSON.stringify({ type: "ERROR", code, message }) });
};

const firebaseAuth = { currentUser: { isAnonymous: true } };

// Lets the async rejection handler (it awaits signOut) finish.
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("guest rejections from the server", () => {
  beforeEach(() => {
    vi.mocked(signOut).mockClear();
  });

  it("signs a guest out and shows why when the guest spots are full, instead of a busy modal", async () => {
    const state = createState();
    state.authIsGuest = true;
    state.authSessionReady = true;
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws, { firebaseAuth });

    sendError(ws, "GUEST_SLOTS_FULL", "Guest spots for this season are full. Sign in to claim an empire.");
    await settle();

    expect(signOut).toHaveBeenCalledWith(firebaseAuth);
    expect(state.authIsGuest).toBe(false);
    expect(state.authSessionReady).toBe(false);
    expect(state.seasonFull).toBe(false);
    expect(mocks.setAuthStatus).toHaveBeenLastCalledWith("Guest spots for this season are full. Sign in to claim an empire.", "error");
  });

  it("treats a full season differently for a guest: sign in, do not wait for an email they cannot get", async () => {
    const state = createState();
    state.authIsGuest = true;
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws, { firebaseAuth });

    sendError(ws, "SEASON_FULL", "This season's empire slots are full. We'll email you when the next season begins.");
    await settle();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(state.seasonFull).toBe(false);
    expect(mocks.setAuthStatus).toHaveBeenLastCalledWith(expect.stringContaining("Sign in with an account"), "error");
  });

  it("leaves the existing full-season screen alone for a real account", async () => {
    const state = createState();
    state.authIsGuest = false;
    const ws = new FakeWebSocket();
    bind(state, ws, { firebaseAuth });

    sendError(ws, "SEASON_FULL", "This season's empire slots are full. We'll email you when the next season begins.");
    await settle();

    expect(signOut).not.toHaveBeenCalled();
    expect(state.seasonFull).toBe(true);
    expect(state.authBusyTitle).toBe("This season is full");
  });
});
