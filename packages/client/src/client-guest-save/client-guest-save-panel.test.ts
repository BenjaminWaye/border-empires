// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credentialWithLink: vi.fn() },
  GoogleAuthProvider: { credentialFromError: vi.fn() },
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailLink: vi.fn(),
  getAdditionalUserInfo: vi.fn()
}));
vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));

import { linkWithPopup, sendSignInLinkToEmail } from "firebase/auth";

import { initGuestSave, resetGuestSaveForTests, type GuestSaveDeps } from "./client-guest-save.js";
import {
  closeGuestSavePanel,
  completeGuestEmailLink,
  openGuestSavePanel,
  resetGuestSavePanelForTests,
  syncGuestSaveBadge
} from "./client-guest-save-panel.js";

const guestState = (overrides: Record<string, unknown> = {}) => ({ authIsGuest: true, authSessionReady: true, needsSeasonJoin: false, ...overrides });

const init = (overrides: Partial<GuestSaveDeps> = {}) =>
  initGuestSave({
    firebaseAuth: { currentUser: { isAnonymous: true, getIdToken: vi.fn(async () => "t") }, authStateReady: async () => undefined } as never,
    googleProvider: {} as never,
    analytics: undefined,
    reload: vi.fn(),
    userAgent: () => "Mozilla/5.0 Safari/605.1.15",
    pageUrl: () => "https://play.example.test/",
    ...overrides
  });

const panel = () => document.getElementById("guest-save-panel");
const badge = () => document.getElementById("guest-save-badge");
const click = (name: string) => (panel()!.querySelector(`[data-guest-save="${name}"]`) as HTMLElement).click();
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
  window.localStorage.clear();
  vi.mocked(linkWithPopup).mockReset();
  vi.mocked(sendSignInLinkToEmail).mockReset();
  resetGuestSaveForTests();
  resetGuestSavePanelForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetGuestSavePanelForTests();
});

describe("guest badge", () => {
  it("shows for a guest who is in the game, and opens the panel when clicked", () => {
    init();

    syncGuestSaveBadge(guestState());

    expect(badge()?.textContent).toContain("Save your empire");
    expect(badge()?.parentElement?.id).toBe("hud");
    badge()!.click();
    expect(panel()).not.toBeNull();
  });

  it("shows only once, however often the HUD re-renders", () => {
    init();

    for (let i = 0; i < 4; i += 1) syncGuestSaveBadge(guestState());

    expect(document.querySelectorAll("#guest-save-badge")).toHaveLength(1);
  });

  it.each([
    ["a real account", { authIsGuest: false }],
    ["a session that is not ready yet", { authSessionReady: false }]
  ])("is absent for %s", (_label, override) => {
    init();

    syncGuestSaveBadge(guestState(override));

    expect(badge()).toBeNull();
  });

  it("goes away, and closes the panel, when the guest becomes a real account", () => {
    init();
    syncGuestSaveBadge(guestState());
    openGuestSavePanel("badge");

    syncGuestSaveBadge(guestState({ authIsGuest: false }));

    expect(badge()).toBeNull();
    expect(panel()).toBeNull();
  });

  it("leaves an open panel alone until a real session exists, so a conflict found at page load is not closed before it is read", async () => {
    init();
    await completeGuestEmailLink({ kind: "conflict" }, "ada@example.com", "https://x/?oobCode=1");

    syncGuestSaveBadge(guestState({ authIsGuest: false, authSessionReady: false }));
    expect(panel()).not.toBeNull();

    syncGuestSaveBadge(guestState({ authIsGuest: false, authSessionReady: true }));
    expect(panel()).toBeNull();
  });

  it("is absent when saving was never set up", () => {
    syncGuestSaveBadge(guestState());

    expect(badge()).toBeNull();
  });
});

describe("unprompted nudge", () => {
  it("opens the panel once after ten minutes in the game, and never again in this browser", () => {
    vi.useFakeTimers();
    init();
    syncGuestSaveBadge(guestState());
    expect(panel()).toBeNull();

    vi.advanceTimersByTime(10 * 60_000);
    expect(panel()).not.toBeNull();
    expect(panel()!.textContent).toContain("Enjoying it?");

    closeGuestSavePanel();
    resetGuestSavePanelForTests();
    syncGuestSaveBadge(guestState());
    vi.advanceTimersByTime(60 * 60_000);
    expect(panel()).toBeNull();
  });

  it("does not start counting before the guest has joined the season", () => {
    vi.useFakeTimers();
    init();

    syncGuestSaveBadge(guestState({ needsSeasonJoin: true }));
    vi.advanceTimersByTime(60 * 60_000);

    expect(panel()).toBeNull();
  });

  it("stays quiet when the guest already closed the panel earlier", () => {
    vi.useFakeTimers();
    init();
    window.localStorage.setItem("be_guest_save_nudged", "1");

    syncGuestSaveBadge(guestState());
    vi.advanceTimersByTime(60 * 60_000);

    expect(panel()).toBeNull();
  });
});

describe("Save your empire panel", () => {
  it("explains what saving gives and that a guest empire lives in this browser, and mentions alliances when opened for one", () => {
    init();

    openGuestSavePanel("diplomacy");

    expect(panel()!.textContent).toContain("Alliances and truces are for saved empires");
    expect(panel()!.textContent).toContain("lives only in this browser");
    expect(panel()!.querySelector('[data-guest-save="google"]')).not.toBeNull();
    expect(panel()!.querySelector('[data-guest-save="email-input"]')).not.toBeNull();
  });

  it("does not stack a second panel when opened again", () => {
    init();

    openGuestSavePanel("badge");
    openGuestSavePanel("diplomacy");

    expect(document.querySelectorAll("#guest-save-panel")).toHaveLength(1);
    expect(panel()!.textContent).toContain("Alliances and truces");
  });

  it("starts Google saving from its button and shows a busy message meanwhile", () => {
    init();
    vi.mocked(linkWithPopup).mockReturnValue(new Promise(() => undefined) as never);
    openGuestSavePanel("badge");

    click("google");

    expect(linkWithPopup).toHaveBeenCalledTimes(1);
    expect(panel()!.textContent).toContain("Opening Google");
  });

  it("sends the email link with the address typed in, then tells the guest to open it in this browser", async () => {
    init();
    vi.mocked(sendSignInLinkToEmail).mockResolvedValue(undefined);
    openGuestSavePanel("badge");
    (panel()!.querySelector('[data-guest-save="email-input"]') as HTMLInputElement).value = "ada@example.com";

    click("email");
    await flush();

    expect(sendSignInLinkToEmail).toHaveBeenCalledWith(expect.anything(), "ada@example.com", expect.anything());
    expect(panel()!.textContent).toContain("Check your email");
    expect(panel()!.textContent).toContain("ada@example.com");
    expect(panel()!.textContent).toContain("same browser");
  });

  it("never turns an address into markup", async () => {
    init();
    vi.mocked(sendSignInLinkToEmail).mockResolvedValue(undefined);
    openGuestSavePanel("badge");
    (panel()!.querySelector('[data-guest-save="email-input"]') as HTMLInputElement).value = "a<img src=x onerror=alert(1)>@b.co";

    click("email");
    await flush();

    expect(panel()!.querySelector("img")).toBeNull();
  });

  it("keeps what was typed when an error brings the form back", async () => {
    init();
    openGuestSavePanel("badge");
    const input = panel()!.querySelector('[data-guest-save="email-input"]') as HTMLInputElement;
    input.value = "not-an-email";

    click("email");
    await flush();

    expect(panel()!.querySelector(".guest-save-error")?.textContent).toContain("valid email");
    expect((panel()!.querySelector('[data-guest-save="email-input"]') as HTMLInputElement).value).toBe("not-an-email");
  });

  it("offers only 'keep playing' inside an in-app browser", () => {
    init({ userAgent: () => "Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 300.0.0.0" });

    openGuestSavePanel("badge");

    expect(panel()!.textContent).toContain("Instagram");
    expect(panel()!.querySelector('[data-guest-save="google"]')).toBeNull();
    expect(panel()!.querySelector('[data-guest-save="email"]')).toBeNull();
    click("close");
    expect(panel()).toBeNull();
  });

  it("closes from the close button and from 'keep playing as a guest' on a conflict", async () => {
    init();
    openGuestSavePanel("badge");
    click("close");
    expect(panel()).toBeNull();

    await completeGuestEmailLink({ kind: "conflict" }, "ada@example.com", "https://x/?oobCode=1");
    expect(panel()).not.toBeNull();
    expect(panel()!.textContent).toContain("already has an empire");
    click("keep");
    expect(panel()).toBeNull();
  });

  it("opens itself to explain a conflict found while completing an emailed link at page load", async () => {
    init();

    await completeGuestEmailLink({ kind: "conflict" }, "ada@example.com", "https://x/?oobCode=1");

    expect(panel()!.textContent).toContain("Switch to that empire");
    expect(panel()!.textContent).toContain("can't be recovered");
  });
});
