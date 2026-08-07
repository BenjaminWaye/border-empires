import { describe, expect, it, vi } from "vitest";
import { syncAuthOverlay } from "./client-auth-ui.js";

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
        profileSetupRequired: false,
        authBusy: true,
        authBusyStartedAt: 8_000,
        authConfigured: true,
        authError: "",
        authReady: true,
        authBusyTitle: "Securing session",
        authBusyDetail: "Game server reached. Verifying your Google session...",
        activeBackend: "gateway",
        bridgeDebugWsUrl: "wss://border-empires-combined-staging.fly.dev/ws"
      },
      {
        authOverlayEl,
        authBusyModalEl,
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
        authBusyTitleEl,
        authBusyCopyEl,
        authBusyDiagnosticsBtn: makeButton(),
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
    expect(authDebugRouteEl.textContent).toContain("border-empires-combined-staging");
  });

  const baseDeps = () => ({
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
    authStatusEl: makeElement(),
    authDebugRouteEl: makeElement(),
    wsUrl: "wss://border-empires.fly.dev/ws",
    syncAuthPanelState: vi.fn(),
    setAuthStatus: vi.fn()
  });

  const baseState = () => ({
    authSessionReady: false,
    profileSetupRequired: false,
    authBusy: true,
    authBusyStartedAt: 1_000,
    authConfigured: true,
    authError: "",
    authReady: true,
    authBusyTitle: "Finishing up...",
    authBusyDetail: "Building session data for a large empire (18s)…",
    activeBackend: "gateway" as const,
    bridgeDebugWsUrl: "wss://border-empires-combined-staging.fly.dev/ws"
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
});
