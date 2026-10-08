import { describe, expect, it, vi } from "vitest";
import { authLabelForUser, syncAuthOverlay } from "./client-auth-ui.js";

const makeButton = (): HTMLButtonElement => ({ disabled: false, style: { display: "" } } as unknown as HTMLButtonElement);
const makeInput = (): HTMLInputElement => ({ disabled: false, value: "" } as HTMLInputElement);
const makeElement = (): HTMLElement =>
  ({
    style: { display: "" },
    dataset: {},
    textContent: "",
    setAttribute: vi.fn()
  } as unknown as HTMLElement);

describe("syncAuthOverlay", () => {
  it("prefers explicit busy phase messaging over generic auth status copy", () => {
    vi.spyOn(Date, "now").mockReturnValue(12_000);
    const authOverlayEl = makeElement();
    const authBusyModalEl = makeElement();
    const authStatusEl = makeElement();
    const authDebugRouteEl = makeElement();
    const authBusyTitleEl = makeElement();
    const authBusyCopyEl = makeElement();
    authStatusEl.textContent = "Generic status";

    syncAuthOverlay(
      {
        authSessionReady: false,
        initTransfer: null,
        mapPrep: null,
        profileSetupRequired: false,
        authBusy: true,
        authBusyStartedAt: 8_000,
        authConfigured: true,
        authError: "",
        authReady: true,
        authBusyTitle: "Securing session",
        authBusyDetail: "Game server reached. Verifying your Google session...",
        activeBackend: "gateway",
        bridgeDebugWsUrl: "wss://api-staging.borderempires.com/ws",
        seasonFull: false,
        seasonFullNotifyAcknowledged: false,
        authEmail: ""
      },
      {
        authOverlayEl,
        authBusyModalEl,
        authLoginBtn: makeButton(),
        authRegisterBtn: makeButton(),
        authEmailLinkBtn: makeButton(),
        authGoogleBtn: makeButton(),
        authTwitchBtn: makeButton(),
        authDiscordBtn: makeButton(),
        authPlayNowBtn: makeButton(),
        authEmailEl: makeInput(),
        authPasswordEl: makeInput(),
        authDisplayNameEl: makeInput(),
        authEmailResetBtn: makeButton(),
        authProfileNameEl: makeInput(),
        authProfileColorEl: makeInput(),
        authProfileSaveBtn: makeButton(),
        authBusyTitleEl,
        authBusyCopyEl,
        authBusyDiagnosticsBtn: makeButton(),
        authBusySeasonFullNotifyBtn: makeButton(),
        authStatusEl,
        authDebugRouteEl,
        wsUrl: "wss://border-empires.fly.dev/ws",
        syncAuthPanelState: vi.fn(),
        setAuthStatus: vi.fn()
      }
    );

    expect(authBusyTitleEl.textContent).toBe("Securing session");
    expect(authBusyCopyEl.textContent).toBe("Game server reached. Verifying your Google session... (4s elapsed)");
    expect(authDebugRouteEl.textContent).toContain("Backend gateway");
    expect(authDebugRouteEl.textContent).toContain("api-staging.borderempires.com");
  });

  const baseDeps = () => ({
    authOverlayEl: makeElement(),
    authBusyModalEl: makeElement(),
    authLoginBtn: makeButton(),
    authRegisterBtn: makeButton(),
    authEmailLinkBtn: makeButton(),
    authGoogleBtn: makeButton(),
    authTwitchBtn: makeButton(),
    authDiscordBtn: makeButton(),
    authPlayNowBtn: makeButton(),
    authEmailEl: makeInput(),
    authPasswordEl: makeInput(),
    authDisplayNameEl: makeInput(),
    authEmailResetBtn: makeButton(),
    authProfileNameEl: makeInput(),
    authProfileColorEl: makeInput(),
    authProfileSaveBtn: makeButton(),
    authBusyTitleEl: makeElement(),
    authBusyCopyEl: makeElement(),
    authBusySeasonFullNotifyBtn: makeButton(),
    authStatusEl: makeElement(),
    authDebugRouteEl: makeElement(),
    wsUrl: "wss://border-empires.fly.dev/ws",
    syncAuthPanelState: vi.fn(),
    setAuthStatus: vi.fn()
  });

  const baseState = () => ({
    authSessionReady: false,
    initTransfer: null,
    mapPrep: null,
    profileSetupRequired: false,
    authBusy: true,
    authBusyStartedAt: 1_000,
    authConfigured: true,
    authError: "",
    authReady: true,
    authBusyTitle: "Finishing up...",
    authBusyDetail: "Building session data for a large empire (18s)…",
    activeBackend: "gateway" as const,
    bridgeDebugWsUrl: "wss://api-staging.borderempires.com/ws",
    seasonFull: false,
    seasonFullNotifyAcknowledged: false,
    authEmail: ""
  });

  it("hides the diagnostics button before the 8s threshold (regression: this overlay used to never show it at all)", () => {
    vi.spyOn(Date, "now").mockReturnValue(7_000);
    const authBusyDiagnosticsBtn = makeButton();
    syncAuthOverlay(baseState(), { ...baseDeps(), authBusyDiagnosticsBtn });
    expect(authBusyDiagnosticsBtn.style.display).toBe("none");
  });

  it("shows the diagnostics button once the busy wait crosses the 8s threshold", () => {
    // Matches the reported real-world case: "Finishing up... Building
    // session data for a large empire (18s)... (27s elapsed)" with no way
    // to grab logs, because this overlay had zero escalation of any kind.
    vi.spyOn(Date, "now").mockReturnValue(27_000);
    const authBusyDiagnosticsBtn = makeButton();
    syncAuthOverlay(baseState(), { ...baseDeps(), authBusyDiagnosticsBtn });
    expect(authBusyDiagnosticsBtn.style.display).toBe("");
  });

  it("hides the diagnostics button once auth is no longer busy, even past the threshold", () => {
    vi.spyOn(Date, "now").mockReturnValue(27_000);
    const authBusyDiagnosticsBtn = makeButton();
    syncAuthOverlay({ ...baseState(), authBusy: false }, { ...baseDeps(), authBusyDiagnosticsBtn });
    expect(authBusyDiagnosticsBtn.style.display).toBe("none");
  });

  it("disables Play now together with the other sign-in buttons while busy or unconfigured", () => {
    const authPlayNowBtn = makeButton();
    const deps = { ...baseDeps(), authBusyDiagnosticsBtn: makeButton(), authPlayNowBtn };

    syncAuthOverlay({ ...baseState(), authBusy: true, authConfigured: true }, deps);
    expect(authPlayNowBtn.disabled).toBe(true);

    syncAuthOverlay({ ...baseState(), authBusy: false, authConfigured: true }, deps);
    expect(authPlayNowBtn.disabled).toBe(false);

    syncAuthOverlay({ ...baseState(), authBusy: false, authConfigured: false }, deps);
    expect(authPlayNowBtn.disabled).toBe(true);
  });
});

describe("authLabelForUser", () => {
  it("names a guest 'Guest' rather than 'Authenticated user', and keeps real names and emails first", () => {
    expect(authLabelForUser({ displayName: null, email: null, isAnonymous: true } as never)).toBe("Guest");
    expect(authLabelForUser({ displayName: " Ada ", email: "a@x.com", isAnonymous: false } as never)).toBe("Ada");
    expect(authLabelForUser({ displayName: null, email: "a@x.com", isAnonymous: false } as never)).toBe("a@x.com");
    expect(authLabelForUser({ displayName: null, email: null, isAnonymous: false } as never)).toBe("Authenticated user");
  });
});
