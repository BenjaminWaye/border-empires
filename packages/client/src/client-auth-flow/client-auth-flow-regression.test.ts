// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeSocket } from "../client-socket-types.js";

const clientSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./client-auth-flow.ts"), "utf8"),
    readFileSync(resolve(here, "../client-network/client-network.ts"), "utf8"),
    // INIT handling (including the map-reveal-on-sign-in wiring this file
    // asserts on) was extracted out of client-network.ts, which is over the
    // repo's file-line cap and may not grow, into its own module.
    readFileSync(resolve(here, "../client-network-init-message/client-network-init-message.ts"), "utf8")
  ].join("\n");
};

describe("client auth flow regression guard", () => {
  it("uses the cached Firebase token for initial auth bootstrap and reserves forced refresh for auth failures", () => {
    const source = clientSource();

    expect(source).toContain('state.authBusyDetail = "Loading your Google session and waiting for the realtime server connection.";');
    expect(source).toContain("authSession.token = await user.getIdToken();");
    expect(source).toContain("void authenticateSocket(true)");
    expect(source).not.toContain("authSession.token = await user.getIdToken(true);");
  });

  it("reloads the map reveal after the debug account signs in and clears it on sign-out", () => {
    const source = clientSource();

    expect(source).toContain('setDebugAuthEmail("");');
    expect(source).toContain("state.mapRevealEligible = false;");
    expect(source).toContain("state.mapRevealEnabled = false;");
    expect(source).toContain("state.authEmail = authEmail ?? \"\";");
    expect(source).toContain("state.mapRevealEnabled = getMapRevealEnabled({");
    expect(source).toContain("state.mapRevealEligible = Boolean(player.canToggleFog);");
    expect(source).toContain("const syncDesiredFogDisabled = (): void => {");
    expect(source).toContain('state.serverSupportedMessageTypes.has("REQUEST_REVEAL_MAP")');
    expect(source).toContain('state.mapRevealEnabled ? { type: "REQUEST_REVEAL_MAP" } : { type: "SET_FOG_DISABLED", disabled: false }');
    expect(source.indexOf("state.mapRevealEligible = Boolean(player.canToggleFog);")).toBeLessThan(
      source.indexOf("syncDesiredFogDisabled();")
    );
  });
});

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  isSignInWithEmailLink: vi.fn(() => true),
  onAuthStateChanged: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  setPersistence: vi.fn(() => Promise.resolve()),
  signInWithEmailAndPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn()
}));

describe("email-link sign-in on Safari with blocked storage", () => {
  const makeButton = (): HTMLButtonElement =>
    ({ disabled: false, onclick: null, style: { display: "" } } as unknown as HTMLButtonElement);
  const makeInput = (): HTMLInputElement => ({ disabled: false, value: "", focus: vi.fn() } as unknown as HTMLInputElement);
  const makeElement = (): HTMLElement =>
    ({
      style: { display: "" },
      dataset: {},
      textContent: "",
      setAttribute: vi.fn()
    } as unknown as HTMLElement);

  const EMAIL_LINK_URL = "https://play.borderempires.com/?apiKey=abc&oobCode=def&mode=signIn&lang=en";

  const makeDom = (): Parameters<typeof import("./client-auth-flow.js").createClientAuthFlow>[0]["dom"] =>
    ({
      authOverlayEl: makeElement(),
      authBusyModalEl: makeElement(),
      authLoginBtn: makeButton(),
      authRegisterBtn: makeButton(),
      authEmailLinkBtn: makeButton(),
      authGoogleBtn: makeButton(),
      authEmailEl: makeInput(),
      authPasswordEl: makeInput(),
      authDisplayNameEl: makeInput(),
      authEmailResetBtn: makeButton(),
      authProfileNameEl: makeInput(),
      authProfileColorEl: makeInput(),
      authProfileSaveBtn: makeButton(),
      authBusyTitleEl: makeElement(),
      authBusyCopyEl: makeElement(),
      authBusyDiagnosticsBtn: makeButton(),
      authStatusEl: makeElement(),
      authDebugRouteEl: makeElement(),
      authPanelEl: makeElement(),
      authEmailSentAddressEl: makeElement(),
      authColorPresetButtons: [] as unknown as NodeListOf<HTMLButtonElement>
    }) as unknown as Parameters<typeof import("./client-auth-flow.js").createClientAuthFlow>[0]["dom"];

  const makeState = (): Parameters<typeof import("./client-auth-flow.js").createClientAuthFlow>[0]["state"] =>
    ({
      authConfigured: false,
      authError: "",
      authReady: false,
      authSessionReady: false,
      authBusy: false,
      authBusyStartedAt: 0,
      authBusyTitle: "",
      authBusyDetail: "",
      profileSetupRequired: false,
      suggestedColors: [],
      activeBackend: "gateway",
      bridgeDebugWsUrl: ""
    }) as unknown as Parameters<typeof import("./client-auth-flow.js").createClientAuthFlow>[0]["state"];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not crash when localStorage.getItem throws while an email sign-in link is open", async () => {
    const { createClientAuthFlow } = await import("./client-auth-flow.js");

    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new DOMException("Storage is disabled", "SecurityError");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    });
    vi.spyOn(window, "location", "get").mockReturnValue({ href: EMAIL_LINK_URL, search: "" } as unknown as Location);

    const dom = makeDom();
    const state = makeState();
    const fakeFirebaseAuth = {} as unknown as NonNullable<Parameters<typeof createClientAuthFlow>[0]["firebaseAuth"]>;

    const authFlow = createClientAuthFlow({
      state,
      dom,
      firebaseAuth: fakeFirebaseAuth,
      ws: { readyState: 3, OPEN: 1 } as unknown as RealtimeSocket,
      wsUrl: "wss://border-empires.fly.dev/ws",
      requireAuthedSession: () => true,
      renderHud: vi.fn(),
      isMobile: () => false
    });

    // Before the fix, an unguarded localStorage.getItem() throw here aborted
    // the rest of client bootstrap uncaught, and because the link's query
    // string was never cleared, every reload reproduced the identical crash
    // (Safari's "a problem repeatedly occurred" page). It must now degrade
    // gracefully to the manual email-entry prompt instead.
    expect(() => authFlow.bindFirebaseAuth()).not.toThrow();
    expect(authFlow.authSession.emailLinkPending).toBe(true);
    expect(state.authError).toBe("");

    Object.defineProperty(window, "localStorage", { configurable: true, value: originalLocalStorage });
  });

  it("clears the stale sign-in link URL and stored email when signInWithEmailLink rejects", async () => {
    const { createClientAuthFlow } = await import("./client-auth-flow.js");
    const { signInWithEmailLink } = await import("firebase/auth");
    vi.mocked(signInWithEmailLink).mockRejectedValueOnce(new Error("auth/invalid-action-code"));

    const removeItem = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => "player@example.com"),
        setItem: vi.fn(),
        removeItem
      }
    });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(window, "location", "get").mockReturnValue({ href: EMAIL_LINK_URL, search: "" } as unknown as Location);

    const dom = makeDom();
    const state = makeState();
    const fakeFirebaseAuth = {} as unknown as NonNullable<Parameters<typeof createClientAuthFlow>[0]["firebaseAuth"]>;

    const authFlow = createClientAuthFlow({
      state,
      dom,
      firebaseAuth: fakeFirebaseAuth,
      ws: { readyState: 3, OPEN: 1 } as unknown as RealtimeSocket,
      wsUrl: "wss://border-empires.fly.dev/ws",
      requireAuthedSession: () => true,
      renderHud: vi.fn(),
      isMobile: () => false
    });

    expect(() => authFlow.bindFirebaseAuth()).not.toThrow();
    await vi.waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalled();
    });

    // A failed/expired sign-in code will fail identically on every retry, so
    // the URL and stored email must be cleared rather than left in place to
    // repeat the same failure on the next reload.
    expect(removeItem).toHaveBeenCalledWith("be_auth_email_link");
    expect(state.authError).toBeTruthy();
  });

  it("blocks Google sign-in inside the Facebook Messenger in-app browser instead of letting it fail with a cryptic Firebase error", async () => {
    const { createClientAuthFlow } = await import("./client-auth-flow.js");
    const { signInWithPopup } = await import("firebase/auth");
    vi.mocked(signInWithPopup).mockClear();

    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 [FBAN/MessengerForiOS;FBAV/400.0.0.0]"
    );

    const dom = makeDom();
    const state = makeState();
    state.authConfigured = true;
    const fakeFirebaseAuth = {} as unknown as NonNullable<Parameters<typeof createClientAuthFlow>[0]["firebaseAuth"]>;
    const fakeGoogleProvider = {} as NonNullable<Parameters<typeof createClientAuthFlow>[0]["googleProvider"]>;

    const authFlow = createClientAuthFlow({
      state,
      dom,
      firebaseAuth: fakeFirebaseAuth,
      googleProvider: fakeGoogleProvider,
      ws: { readyState: 3, OPEN: 1 } as unknown as RealtimeSocket,
      wsUrl: "wss://border-empires.fly.dev/ws",
      requireAuthedSession: () => true,
      renderHud: vi.fn(),
      isMobile: () => false
    });

    authFlow.bindAuthUi();
    await dom.authGoogleBtn.onclick?.(new PointerEvent("click"));

    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(state.authError).toContain("Facebook Messenger");
  });
});
