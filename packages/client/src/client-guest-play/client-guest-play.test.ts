// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  signInAnonymously: vi.fn(),
  signOut: vi.fn(async () => undefined),
  getAdditionalUserInfo: vi.fn()
}));
vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("../client-guest-save/client-guest-save-panel.js", () => ({ notifyInAppBrowserGuestStart: vi.fn() }));

import { getAdditionalUserInfo, signInAnonymously, signOut } from "firebase/auth";
import { logEvent } from "firebase/analytics";
import { notifyInAppBrowserGuestStart } from "../client-guest-save/client-guest-save-panel.js";

import {
  applyGuestRejection,
  bindGuestPlay,
  hasReturningAccount,
  markReturningAccount,
  resetGuestAutoJoinForTests,
  startGuestPlay,
  syncPlayNowEmphasis,
  takeGuestAutoJoinTurn
} from "./client-guest-play.js";

const auth = {} as never;
const analytics = {} as never;

const makeState = () => ({ authBusy: false, authBusyStartedAt: 0, authBusyTitle: "", authBusyDetail: "", authConfigured: true });

const REGULAR_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

const makeDeps = (state = makeState(), userAgent: string = REGULAR_BROWSER) => {
  const setAuthBusy = vi.fn((busy: boolean) => {
    state.authBusy = busy;
    state.authBusyStartedAt = busy ? 1 : 0;
  });
  return { state, firebaseAuth: auth, analytics, userAgent: () => userAgent, setAuthBusy, setAuthStatus: vi.fn(), syncAuthOverlay: vi.fn() };
};

beforeEach(() => {
  vi.mocked(signInAnonymously).mockReset();
  vi.mocked(signOut).mockClear();
  vi.mocked(logEvent).mockClear();
  vi.mocked(getAdditionalUserInfo).mockReset();
  window.localStorage.clear();
  resetGuestAutoJoinForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startGuestPlay", () => {
  it("signs in anonymously and hands the busy state over to the normal auth flow", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    const deps = makeDeps();

    await startGuestPlay(deps);

    expect(signInAnonymously).toHaveBeenCalledWith(auth);
    expect(deps.state.authBusy).toBe(true); // onAuthStateChanged takes over from here
    expect(deps.state.authBusyTitle).toBe("Starting your empire...");
  });

  it("logs guest_start, never sign_up, and only for a brand-new anonymous account", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    vi.mocked(getAdditionalUserInfo).mockReturnValue({ isNewUser: true } as never);
    await startGuestPlay(makeDeps());
    vi.mocked(getAdditionalUserInfo).mockReturnValue({ isNewUser: false } as never);
    await startGuestPlay(makeDeps());

    const events = vi.mocked(logEvent).mock.calls.map((call) => call[1]);
    expect(events).toEqual(["guest_start"]);
  });

  it("clears the busy state and shows the reason when Firebase refuses", async () => {
    vi.mocked(signInAnonymously).mockRejectedValue(new Error("auth/admin-restricted-operation"));
    const deps = makeDeps();

    await startGuestPlay(deps);

    expect(deps.state.authBusy).toBe(false);
    expect(deps.setAuthStatus).toHaveBeenLastCalledWith("auth/admin-restricted-operation", "error");
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("does nothing without Firebase or while a sign-in is already running", async () => {
    const noAuth = makeDeps();
    await startGuestPlay({ ...noAuth, firebaseAuth: undefined });
    const busy = makeDeps({ ...makeState(), authBusy: true });
    await startGuestPlay(busy);

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("is not blocked inside an in-app browser, unlike Google sign-in", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    const inAppUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0";

    await startGuestPlay(makeDeps(makeState(), inAppUa));

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("warns immediately when a guest starts in an in-app browser, instead of waiting until they try to save", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    vi.mocked(notifyInAppBrowserGuestStart).mockClear();
    const inAppUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0";

    await startGuestPlay(makeDeps(makeState(), inAppUa));

    expect(notifyInAppBrowserGuestStart).toHaveBeenCalledWith(inAppUa);
  });

  it("always delegates the in-app decision to notifyInAppBrowserGuestStart, which decides whether to show anything (see client-guest-save-panel.test.ts)", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    vi.mocked(notifyInAppBrowserGuestStart).mockClear();

    await startGuestPlay(makeDeps());

    expect(notifyInAppBrowserGuestStart).toHaveBeenCalledWith(REGULAR_BROWSER);
  });
});

describe("Play now button", () => {
  const makeButton = () => ({ dataset: {} as Record<string, string>, onclick: null as null | (() => void) }) as unknown as HTMLButtonElement;

  it("is the primary button for a first-time visitor and the secondary one once a real account has signed in here", () => {
    const first = makeButton();
    syncPlayNowEmphasis(first);
    expect(first.dataset.emphasis).toBe("primary");

    markReturningAccount();
    expect(hasReturningAccount()).toBe(true);
    const returning = makeButton();
    syncPlayNowEmphasis(returning);
    expect(returning.dataset.emphasis).toBe("secondary");
  });

  it("starts a guest session when clicked", async () => {
    vi.mocked(signInAnonymously).mockResolvedValue({} as never);
    const playNowBtn = makeButton();

    bindGuestPlay({ ...makeDeps(), playNowBtn });
    (playNowBtn.onclick as () => void)();
    await Promise.resolve();

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });
});

describe("applyGuestRejection", () => {
  const makeGuestState = (isGuest: boolean) => ({
    authIsGuest: isGuest,
    authSessionReady: true,
    authRetrying: true,
    joinSeasonPending: true,
    needsSeasonJoin: true,
    joinSeasonOverlayOpen: true
  });

  it("signs a turned-away guest out and shows the sign-in card with the server's reason", async () => {
    const state = makeGuestState(true);
    const setAuthStatus = vi.fn();
    const syncAuthOverlay = vi.fn();

    await applyGuestRejection({ state, firebaseAuth: auth, setAuthStatus, syncAuthOverlay }, "GUEST_SLOTS_FULL", "Guest spots are full. Sign in.");

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(state).toMatchObject({ authIsGuest: false, authSessionReady: false, authRetrying: false, joinSeasonPending: false, needsSeasonJoin: false, joinSeasonOverlayOpen: false });
    expect(setAuthStatus).toHaveBeenCalledWith("Guest spots are full. Sign in.", "error");
    expect(syncAuthOverlay).toHaveBeenCalled();
  });

  it("replaces the misleading 'we'll email you' text when the whole season is full for a guest", async () => {
    const setAuthStatus = vi.fn();

    await applyGuestRejection(
      { state: makeGuestState(true), firebaseAuth: auth, setAuthStatus, syncAuthOverlay: vi.fn() },
      "SEASON_FULL",
      "This season's empire slots are full. We'll email you when the next season begins."
    );

    expect(setAuthStatus).toHaveBeenCalledWith(expect.stringContaining("Sign in with an account"), "error");
  });

  it("never signs out anyone who is not a guest", async () => {
    const state = makeGuestState(false);
    const setAuthStatus = vi.fn();

    await applyGuestRejection({ state, firebaseAuth: auth, setAuthStatus, syncAuthOverlay: vi.fn() }, "GUEST_SLOTS_FULL", "x");

    expect(signOut).not.toHaveBeenCalled();
    expect(state.authSessionReady).toBe(true);
    expect(setAuthStatus).not.toHaveBeenCalled();
  });

  it("still shows the message if signing out fails", async () => {
    vi.mocked(signOut).mockRejectedValueOnce(new Error("network"));
    const setAuthStatus = vi.fn();

    await applyGuestRejection({ state: makeGuestState(true), firebaseAuth: auth, setAuthStatus, syncAuthOverlay: vi.fn() }, "GUEST_SLOTS_FULL", "Full.");

    expect(setAuthStatus).toHaveBeenCalledWith("Full.", "error");
  });
});

describe("takeGuestAutoJoinTurn", () => {
  const ready = { authIsGuest: true, needsSeasonJoin: true, seasonPending: false, joinSeasonPending: false, profileSetupRequired: false };

  it("lets a guest waiting to join an active season through, once", () => {
    expect(takeGuestAutoJoinTurn(ready, 100_000)).toBe(true);
    expect(takeGuestAutoJoinTurn(ready, 100_500)).toBe(false);
  });

  it("allows another attempt after a while, so a join that did not spawn is retried but never in a tight loop", () => {
    expect(takeGuestAutoJoinTurn(ready, 100_000)).toBe(true);
    expect(takeGuestAutoJoinTurn(ready, 110_000)).toBe(false);
    expect(takeGuestAutoJoinTurn(ready, 115_001)).toBe(true);
  });

  it.each([
    ["a real account", { authIsGuest: false }],
    ["nothing to join", { needsSeasonJoin: false }],
    ["a pending season (the lobby countdown joins them)", { seasonPending: true }],
    ["a join already in flight", { joinSeasonPending: true }],
    ["profile setup not finished", { profileSetupRequired: true }]
  ])("does not fire for %s", (_label, override) => {
    expect(takeGuestAutoJoinTurn({ ...ready, ...override }, 100_000)).toBe(false);
    // a refusal must not use up the guest's turn
    expect(takeGuestAutoJoinTurn(ready, 100_000)).toBe(true);
  });
});
