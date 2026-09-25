import { describe, expect, it, vi } from "vitest";
import type { InitTransferProgress } from "../client-socket-types.js";
import { syncAuthOverlay } from "./client-auth-ui.js";

// Regression: the last login step showed "Packaging your session for
// delivery. (2s elapsed)" frozen for 10s+ on phones while the INIT
// downloaded. Chunked-INIT progress must now drive the title, copy and bar.

const makeButton = (): HTMLButtonElement => ({ disabled: false, style: { display: "" } } as unknown as HTMLButtonElement);
const makeInput = (): HTMLInputElement => ({ disabled: false, value: "" } as HTMLInputElement);
const makeElement = (): HTMLElement =>
  ({ style: { display: "" }, dataset: {}, textContent: "", setAttribute: vi.fn() } as unknown as HTMLElement);

const makeProgressBar = () => {
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  const bar = {
    hidden: true,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: { setProperty: (name: string, value: string) => properties.set(name, value) }
  };
  return { bar, attributes, properties };
};

const render = (initTransfer: InitTransferProgress | null, overrides: { authSessionReady?: boolean; authError?: string } = {}) => {
  vi.spyOn(Date, "now").mockReturnValue(12_000);
  const progress = makeProgressBar();
  const authBusyTitleEl = makeElement();
  const authBusyCopyEl = makeElement();
  syncAuthOverlay(
    {
      authSessionReady: overrides.authSessionReady ?? false,
      initTransfer,
      profileSetupRequired: false,
      authBusy: true,
      authBusyStartedAt: 10_000,
      authConfigured: true,
      authError: overrides.authError ?? "",
      authReady: true,
      authBusyTitle: "Finishing up...",
      authBusyDetail: "Packaging your session for delivery.",
      activeBackend: "gateway",
      bridgeDebugWsUrl: "wss://border-empires-combined.fly.dev/ws",
      seasonFull: false,
      seasonFullNotifyAcknowledged: false,
      authEmail: ""
    },
    {
      authOverlayEl: makeElement(),
      authBusyModalEl: makeElement(),
      authBusyProgressEl: progress.bar as unknown as HTMLElement,
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
      authBusySeasonFullNotifyBtn: makeButton(),
      authStatusEl: makeElement(),
      authDebugRouteEl: makeElement(),
      wsUrl: "wss://border-empires.fly.dev/ws",
      syncAuthPanelState: vi.fn(),
      setAuthStatus: vi.fn()
    }
  );
  return { title: authBusyTitleEl.textContent, copy: authBusyCopyEl.textContent, ...progress };
};

describe("syncAuthOverlay chunked INIT progress", () => {
  it("keeps the gateway phase text and hides the bar before any INIT chunk arrives", () => {
    const view = render(null);
    expect(view.title).toBe("Finishing up...");
    expect(view.copy).toBe("Packaging your session for delivery. (2s elapsed)");
    expect(view.bar.hidden).toBe(true);
  });

  it("shows download progress, a filled bar and the time left while the INIT downloads", () => {
    // Clock is 12_000: 268 KB in the 1s since the 32 KB first frame, 700 KB to go.
    const view = render({ phase: "downloading", receivedChars: 300 * 1024, totalChars: 1000 * 1024, startedAt: 11_000, firstFrameChars: 32 * 1024 });
    expect(view.title).toBe("Downloading your world...");
    expect(view.copy).toMatch(/^300 KB of 1,000 KB received\. About \d+s left\.$/);
    expect(view.bar.hidden).toBe(false);
    expect(view.attributes.get("aria-valuenow")).toBe("30");
    expect(view.properties.get("--auth-busy-progress")).toBe("30%");
  });

  it("shows the building state with a full bar once the download completes", () => {
    const view = render({ phase: "building", receivedChars: 1000, totalChars: 1000, startedAt: 11_000, firstFrameChars: 500 });
    expect(view.title).toBe("Building your map...");
    expect(view.copy).toBe("World downloaded. Laying out your territory. About 1s left.");
    expect(view.properties.get("--auth-busy-progress")).toBe("100%");
  });

  it("lets an auth error replace the progress view", () => {
    const view = render({ phase: "downloading", receivedChars: 1, totalChars: 10, startedAt: 11_000, firstFrameChars: 1 }, { authError: "Login failed" });
    expect(view.copy).toBe("Login failed");
    expect(view.bar.hidden).toBe(true);
  });
});
