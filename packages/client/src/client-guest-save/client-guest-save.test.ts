// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credentialWithLink: vi.fn((email: string, href: string) => ({ kind: "email-credential", email, href })) },
  GoogleAuthProvider: { credentialFromError: vi.fn() },
  OAuthProvider: { credentialFromError: vi.fn() },
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailLink: vi.fn(),
  getAdditionalUserInfo: vi.fn()
}));
vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink
} from "firebase/auth";
import { logEvent } from "firebase/analytics";

import { createGuestSaveController, linkOrSignInWithEmailLink, type GuestSaveDeps } from "./client-guest-save.js";

const REGULAR_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0";

const makeDeps = (overrides: Partial<GuestSaveDeps> & { isAnonymous?: boolean } = {}) => {
  const getIdToken = vi.fn(async () => "fresh-token");
  const firebaseAuth = {
    currentUser: { isAnonymous: overrides.isAnonymous ?? true, getIdToken },
    authStateReady: vi.fn(async () => undefined)
  };
  const deps: GuestSaveDeps = {
    firebaseAuth: firebaseAuth as never,
    googleProvider: {} as never,
    analytics: {} as never,
    reload: vi.fn(),
    userAgent: () => REGULAR_BROWSER,
    pageUrl: () => "https://play.borderempires.com/r/abc?foo=1#hash",
    ...overrides
  };
  return { deps, firebaseAuth, getIdToken };
};

const loggedEvents = () => vi.mocked(logEvent).mock.calls.map((call) => call[1]);

beforeEach(() => {
  const mocks: Array<{ mockReset: () => unknown }> = [
    vi.mocked(linkWithCredential),
    vi.mocked(linkWithPopup),
    vi.mocked(sendSignInLinkToEmail),
    vi.mocked(signInWithCredential),
    vi.mocked(signInWithEmailLink),
    vi.mocked(logEvent),
    vi.mocked(GoogleAuthProvider.credentialFromError),
    vi.mocked(OAuthProvider.credentialFromError)
  ];
  for (const mock of mocks) mock.mockReset();
  window.localStorage.clear();
});

describe("saving with Twitch", () => {
  it("links the Twitch provider to the guest and reloads", async () => {
    vi.mocked(linkWithPopup).mockResolvedValue({} as never);
    const twitchProvider = { providerId: "oidc.twitch" } as never;
    const { deps, firebaseAuth } = makeDeps({ twitchProvider });
    const controller = createGuestSaveController(deps);

    await controller.saveWithTwitch();

    expect(linkWithPopup).toHaveBeenCalledWith(firebaseAuth.currentUser, twitchProvider);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("offers to switch using the Twitch credential when that Twitch account already has an empire", async () => {
    const credential = { kind: "twitch-credential" };
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/credential-already-in-use" });
    vi.mocked(OAuthProvider.credentialFromError).mockReturnValue(credential as never);
    vi.mocked(signInWithCredential).mockResolvedValue({} as never);
    const { deps, firebaseAuth } = makeDeps({ twitchProvider: {} as never });
    const controller = createGuestSaveController(deps);

    await controller.saveWithTwitch();
    expect(controller.getView()).toEqual({ kind: "conflict", method: "oidc.twitch" });
    expect(GoogleAuthProvider.credentialFromError).not.toHaveBeenCalled();

    await controller.switchToExisting();
    expect(signInWithCredential).toHaveBeenCalledWith(firebaseAuth, credential);
  });

  it("links Discord with its own provider and uses the generic OAuth credential on a conflict", async () => {
    const discordProvider = { providerId: "oidc.discord" } as never;
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/credential-already-in-use" });
    vi.mocked(OAuthProvider.credentialFromError).mockReturnValue({ kind: "discord-credential" } as never);
    const { deps, firebaseAuth } = makeDeps({ discordProvider });
    const controller = createGuestSaveController(deps);

    await controller.saveWithDiscord();

    expect(linkWithPopup).toHaveBeenCalledWith(firebaseAuth.currentUser, discordProvider);
    expect(controller.getView()).toEqual({ kind: "conflict", method: "oidc.discord" });
    expect(GoogleAuthProvider.credentialFromError).not.toHaveBeenCalled();
  });

  it("says Twitch is unavailable when no Twitch provider is configured", async () => {
    const controller = createGuestSaveController(makeDeps().deps);

    await controller.saveWithTwitch();

    expect(linkWithPopup).not.toHaveBeenCalled();
    expect(controller.getView()).toEqual({ kind: "error", message: "Twitch sign-in isn't available right now." });
  });
});

describe("saving with Google", () => {
  it("links Google to the guest, refreshes the token, logs the upgrade as a sign-up, and reloads", async () => {
    vi.mocked(linkWithPopup).mockResolvedValue({} as never);
    const { deps, firebaseAuth, getIdToken } = makeDeps();
    const controller = createGuestSaveController(deps);

    await controller.saveWithGoogle();

    expect(linkWithPopup).toHaveBeenCalledWith(firebaseAuth.currentUser, deps.googleProvider);
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(loggedEvents()).toEqual(["sign_up", "guest_upgrade"]);
  });

  it("goes quietly back to the start when the popup is closed", async () => {
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/popup-closed-by-user" });
    const { deps } = makeDeps();
    const controller = createGuestSaveController(deps);

    await controller.saveWithGoogle();

    expect(controller.getView()).toEqual({ kind: "idle" });
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("offers to switch when the Google account already has an empire, and Switch signs in to it and reloads", async () => {
    const credential = { kind: "google-credential" };
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/credential-already-in-use" });
    vi.mocked(GoogleAuthProvider.credentialFromError).mockReturnValue(credential as never);
    vi.mocked(signInWithCredential).mockResolvedValue({} as never);
    const { deps, firebaseAuth } = makeDeps();
    const controller = createGuestSaveController(deps);

    await controller.saveWithGoogle();
    expect(controller.getView()).toEqual({ kind: "conflict", method: "google.com" });
    expect(deps.reload).not.toHaveBeenCalled();
    expect(loggedEvents()).toEqual(["guest_upgrade_conflict"]);

    await controller.switchToExisting();
    expect(signInWithCredential).toHaveBeenCalledWith(firebaseAuth, credential);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the guest signed in when they choose to keep playing as a guest", async () => {
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/credential-already-in-use" });
    vi.mocked(GoogleAuthProvider.credentialFromError).mockReturnValue({} as never);
    const { deps } = makeDeps();
    const controller = createGuestSaveController(deps);
    await controller.saveWithGoogle();

    controller.keepPlayingAsGuest();
    await controller.switchToExisting();

    expect(controller.getView()).toEqual({ kind: "idle" });
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it("explains itself instead of showing a raw Firebase code when a conflict has nothing to sign in with", async () => {
    vi.mocked(linkWithPopup).mockRejectedValue({ code: "auth/email-already-in-use" });
    vi.mocked(GoogleAuthProvider.credentialFromError).mockReturnValue(null);
    const controller = createGuestSaveController(makeDeps().deps);

    await controller.saveWithGoogle();

    expect(controller.getView()).toMatchObject({ kind: "error", message: expect.stringContaining("already has an empire") });
  });

  it("shows the error for anything else", async () => {
    vi.mocked(linkWithPopup).mockRejectedValue(new Error("network down"));
    const controller = createGuestSaveController(makeDeps().deps);

    await controller.saveWithGoogle();

    expect(controller.getView()).toEqual({ kind: "error", message: "network down" });
  });
});

describe("saving with an email link", () => {
  it("sends the link to the current page without its query, and remembers the address for this browser", async () => {
    vi.mocked(sendSignInLinkToEmail).mockResolvedValue(undefined);
    const { deps, firebaseAuth } = makeDeps();
    const controller = createGuestSaveController(deps);

    await controller.saveWithEmail("  ada@example.com ");

    expect(sendSignInLinkToEmail).toHaveBeenCalledWith(firebaseAuth, "ada@example.com", {
      url: "https://play.borderempires.com/r/abc",
      handleCodeInApp: true
    });
    expect(window.localStorage.getItem("be_auth_email_link")).toBe("ada@example.com");
    expect(controller.getView()).toEqual({ kind: "email-sent", email: "ada@example.com" });
  });

  it("rejects an address that is not an email without contacting Firebase", async () => {
    const controller = createGuestSaveController(makeDeps().deps);

    await controller.saveWithEmail("not an email");

    expect(controller.getView()).toMatchObject({ kind: "error" });
    expect(sendSignInLinkToEmail).not.toHaveBeenCalled();
  });
});

describe("completing an emailed link", () => {
  const href = "https://play.borderempires.com/?oobCode=abc";

  it("links the email to a guest instead of signing in, after waiting for the saved session to load", async () => {
    vi.mocked(linkWithCredential).mockResolvedValue({ user: "linked" } as never);
    const { firebaseAuth } = makeDeps();

    const result = await linkOrSignInWithEmailLink(firebaseAuth as never, "ada@example.com", href);

    expect(firebaseAuth.authStateReady).toHaveBeenCalled();
    expect(EmailAuthProvider.credentialWithLink).toHaveBeenCalledWith("ada@example.com", href);
    expect(linkWithCredential).toHaveBeenCalledWith(firebaseAuth.currentUser, { kind: "email-credential", email: "ada@example.com", href });
    expect(signInWithEmailLink).not.toHaveBeenCalled();
    expect(result.kind).toBe("linked");
  });

  it("signs in as usual for anyone who is not a guest", async () => {
    vi.mocked(signInWithEmailLink).mockResolvedValue({ user: "signed-in" } as never);
    const { firebaseAuth } = makeDeps({ isAnonymous: false });

    const result = await linkOrSignInWithEmailLink(firebaseAuth as never, "ada@example.com", href);

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(result.kind).toBe("signed-in");
  });

  it("reports a conflict when the email already has an empire, and lets Switch sign in with the saved link", async () => {
    vi.mocked(linkWithCredential).mockRejectedValue({ code: "auth/email-already-in-use" });
    vi.mocked(signInWithEmailLink).mockResolvedValue({} as never);
    const { deps, firebaseAuth } = makeDeps();
    const controller = createGuestSaveController(deps);

    const result = await linkOrSignInWithEmailLink(firebaseAuth as never, "ada@example.com", href);
    expect(result).toEqual({ kind: "conflict" });
    await controller.handleEmailLinkResult(result, "ada@example.com", href);
    expect(controller.getView()).toEqual({ kind: "conflict", method: "email-link" });

    await controller.switchToExisting();
    expect(signInWithEmailLink).toHaveBeenCalledWith(firebaseAuth, "ada@example.com", href);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("lets any other linking failure surface", async () => {
    vi.mocked(linkWithCredential).mockRejectedValue({ code: "auth/invalid-action-code" });
    const { firebaseAuth } = makeDeps();

    await expect(linkOrSignInWithEmailLink(firebaseAuth as never, "a@b.co", href)).rejects.toEqual({ code: "auth/invalid-action-code" });
  });

  it("finishes the save (token refresh, upgrade logged, reload) once the link succeeded", async () => {
    const { deps, getIdToken } = makeDeps();
    const controller = createGuestSaveController(deps);

    await controller.handleEmailLinkResult({ kind: "linked", credential: {} as never }, "ada@example.com", href);

    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(loggedEvents()).toEqual(["sign_up", "guest_upgrade"]);
  });
});

describe("where saving is not possible", () => {
  it("refuses inside an in-app browser, where a saved empire would be stranded, and touches nothing", async () => {
    const { deps } = makeDeps({ userAgent: () => INSTAGRAM });
    const controller = createGuestSaveController(deps);

    expect(controller.unavailableReason()).toContain("Instagram");
    await controller.saveWithGoogle();
    expect(controller.getView()).toMatchObject({ kind: "error", message: expect.stringContaining("Instagram") });
    await controller.saveWithEmail("ada@example.com");

    expect(linkWithPopup).not.toHaveBeenCalled();
    expect(sendSignInLinkToEmail).not.toHaveBeenCalled();
  });

  it("never acts on a real account", async () => {
    const { deps } = makeDeps({ isAnonymous: false });
    const controller = createGuestSaveController(deps);

    await controller.saveWithGoogle();
    await controller.saveWithEmail("ada@example.com");

    expect(linkWithPopup).not.toHaveBeenCalled();
    expect(sendSignInLinkToEmail).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("does nothing without Firebase", async () => {
    const { deps } = makeDeps({ firebaseAuth: undefined });
    const controller = createGuestSaveController(deps);

    await controller.saveWithGoogle();
    await controller.saveWithEmail("ada@example.com");
    await controller.switchToExisting();

    expect(deps.reload).not.toHaveBeenCalled();
  });
});
