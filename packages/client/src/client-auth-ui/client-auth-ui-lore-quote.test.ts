// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadingLoreQuote } from "../client-login-lore-quotes/client-login-lore-quotes.js";
import { syncAuthOverlay } from "./client-auth-ui.js";

type OverlayState = Parameters<typeof syncAuthOverlay>[0];

const baseState: OverlayState = {
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
  authBusyDetail: "Placing towns and structures...",
  activeBackend: "gateway",
  bridgeDebugWsUrl: "",
  seasonFull: false,
  seasonFullNotifyAcknowledged: false,
  sectorWaitlistCount: -1,
  sectorWaitlistJoinFailed: false,
  authEmail: ""
};

const el = <T extends HTMLElement = HTMLElement>(tag = "div"): T => document.createElement(tag) as T;

const renderCard = (state: Partial<OverlayState>) => {
  document.body.innerHTML = `<figure id="auth-busy-quote" hidden><blockquote data-lore-quote-text></blockquote><figcaption data-lore-quote-source></figcaption></figure>`;
  const authBusyQuoteEl = document.querySelector<HTMLElement>("#auth-busy-quote")!;
  const authBusyDiagnosticsBtn = el<HTMLButtonElement>("button");
  authBusyDiagnosticsBtn.style.display = "none";
  syncAuthOverlay(
    { ...baseState, ...state },
    {
      authOverlayEl: el(),
      authBusyModalEl: el(),
      authLoginBtn: el("button"),
      authRegisterBtn: el("button"),
      authEmailLinkBtn: el("button"),
      authGoogleBtn: el("button"),
      authTwitchBtn: el("button"),
      authDiscordBtn: el("button"),
      authPlayNowBtn: el("button"),
      authEmailEl: el("input"),
      authPasswordEl: el("input"),
      authDisplayNameEl: el("input"),
      authEmailResetBtn: el("button"),
      authProfileNameEl: el("input"),
      authProfileColorEl: el("input"),
      authProfileSaveBtn: el("button"),
      authBusyTitleEl: el(),
      authBusyCopyEl: el(),
      authBusyQuoteEl,
      authBusyDiagnosticsBtn,
      authBusySeasonFullNotifyBtn: el("button"),
      authStatusEl: el(),
      authDebugRouteEl: el(),
      wsUrl: "wss://example.test/ws",
      syncAuthPanelState: vi.fn(),
      setAuthStatus: vi.fn()
    }
  );
  return { quote: authBusyQuoteEl, diagnosticsBtn: authBusyDiagnosticsBtn };
};

describe("Securing session card lore quote", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the page's loading quote while sign-in and the world load run", () => {
    const quote = loadingLoreQuote();
    const { quote: figure } = renderCard({});
    expect(figure.hidden).toBe(false);
    expect(figure.querySelector("[data-lore-quote-text]")!.textContent).toBe(quote.text);
    expect(figure.querySelector("[data-lore-quote-source]")!.textContent).toBe(quote.source);
  });

  it("keeps the quote once the slow-login diagnostics button appears", () => {
    vi.spyOn(Date, "now").mockReturnValue(60_000);
    const card = renderCard({ authBusyStartedAt: 1_000 });
    expect(card.diagnosticsBtn.style.display).toBe("");
    expect(card.quote.hidden).toBe(false);
  });

  it("keeps the quote while the 3D map is built after sign-in", () => {
    const now = 100_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const card = renderCard({
      authBusy: false,
      authSessionReady: true,
      mapPrep: { stage: "terrain", index: 1, startedAt: now - 2_000, stageStartedAt: now - 500 }
    });
    expect(card.quote.hidden).toBe(false);
  });

  it("hides the quote when the card is no longer a wait", () => {
    expect(renderCard({ authBusy: false }).quote.hidden).toBe(true);
    expect(renderCard({ authError: "Sign-in failed." }).quote.hidden).toBe(true);
    expect(renderCard({ seasonFull: true }).quote.hidden).toBe(true);
  });
});
