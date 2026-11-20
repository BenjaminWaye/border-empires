// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";
import { LOGIN_LORE_QUOTES } from "../client-login-lore-quotes/client-login-lore-quotes.js";
import { syncAuthOverlay } from "./client-auth-ui.js";

// Regression: lore quotes only rendered in the in-game map-loading overlay,
// which a fresh login never shows (the sign-in busy card covers the whole
// wait). Players saw quotes on reconnects but never while logging in.

const makeButton = (): HTMLButtonElement => ({ disabled: false, style: { display: "" } } as unknown as HTMLButtonElement);
const makeInput = (): HTMLInputElement => ({ disabled: false, value: "" } as HTMLInputElement);
const makeElement = (): HTMLElement =>
  ({ style: { display: "" }, dataset: {}, textContent: "", setAttribute: vi.fn() } as unknown as HTMLElement);

const mountQuote = (): HTMLElement => {
  document.body.innerHTML = hudMarkup;
  const quote = document.querySelector<HTMLElement>("#auth-busy-modal #auth-busy-quote");
  expect(quote, "sign-in busy card has a quote slot").not.toBeNull();
  return quote!;
};

const render = (quoteEl: HTMLElement, overrides: { authBusy?: boolean; authError?: string; seasonFull?: boolean; elapsedMs?: number } = {}) => {
  vi.spyOn(Date, "now").mockReturnValue(10_000 + (overrides.elapsedMs ?? 2_000));
  syncAuthOverlay(
    {
      authSessionReady: false,
      initTransfer: null,
      mapPrep: null,
      profileSetupRequired: false,
      authBusy: overrides.authBusy ?? true,
      authBusyStartedAt: 10_000,
      authConfigured: true,
      authError: overrides.authError ?? "",
      authReady: true,
      authBusyTitle: "Connecting your empire...",
      authBusyDetail: "",
      activeBackend: "gateway",
      bridgeDebugWsUrl: "",
      seasonFull: overrides.seasonFull ?? false,
      seasonFullNotifyAcknowledged: false,
      sectorWaitlistCount: -1,
      sectorWaitlistJoinFailed: false,
      authEmail: ""
    },
    {
      authOverlayEl: makeElement(),
      authBusyModalEl: makeElement(),
      authBusyQuoteEl: quoteEl,
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
      authBusyDiagnosticsBtn: makeButton(),
      authBusySeasonFullNotifyBtn: makeButton(),
      authStatusEl: makeElement(),
      authDebugRouteEl: makeElement(),
      wsUrl: "wss://example.test/ws",
      syncAuthPanelState: vi.fn(),
      setAuthStatus: vi.fn()
    }
  );
};

describe("sign-in busy card lore quote", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a lore quote while the player is logging in", () => {
    const quoteEl = mountQuote();
    render(quoteEl);
    expect(quoteEl.hidden).toBe(false);
    const text = quoteEl.querySelector("blockquote")!.textContent;
    const source = quoteEl.querySelector("figcaption")!.textContent;
    expect(LOGIN_LORE_QUOTES).toContainEqual({ text, source });
  });

  it("keeps the quote once the slow-login diagnostics button appears", () => {
    const quoteEl = mountQuote();
    render(quoteEl, { elapsedMs: 60_000 });
    expect(quoteEl.hidden).toBe(false);
  });

  it("steps aside for an error, a full Sector, or when not busy", () => {
    const quoteEl = mountQuote();
    for (const overrides of [{ authError: "Sign-in failed" }, { seasonFull: true }, { authBusy: false }]) {
      render(quoteEl);
      expect(quoteEl.hidden).toBe(false);
      render(quoteEl, overrides);
      expect(quoteEl.hidden, JSON.stringify(overrides)).toBe(true);
    }
  });
});
