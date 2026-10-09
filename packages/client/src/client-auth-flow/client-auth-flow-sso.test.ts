import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth, AuthProvider, UserCredential } from "firebase/auth";
import type { SsoProvider } from "./client-auth-flow-sso.js";

vi.mock("firebase/auth", () => ({
  getAdditionalUserInfo: vi.fn(() => ({ isNewUser: true })),
  signInWithPopup: vi.fn()
}));

vi.mock("./client-auth-flow-analytics.js", () => ({
  logSignUpIfNewUser: vi.fn()
}));

const { signInWithPopup } = await import("firebase/auth");
const { logSignUpIfNewUser } = await import("./client-auth-flow-analytics.js");
const { createSsoSignInHandler, signInProviderLabel, ssoSignInErrorMessage, TWITCH_PROVIDER_ID } = await import("./client-auth-flow-sso.js");

const twitch: SsoProvider = { provider: { providerId: TWITCH_PROVIDER_ID } as AuthProvider, label: "Twitch", method: "oidc.twitch" };

const makeDeps = (userAgent = "Mozilla/5.0 Chrome/120") => {
  const statuses: Array<{ message: string; tone: string | undefined }> = [];
  const deps = {
    firebaseAuth: {} as Auth,
    analytics: undefined,
    userAgent: () => userAgent,
    clearEmailLinkSentTo: vi.fn(),
    setAuthBusy: vi.fn(),
    setAuthStatus: vi.fn((message: string, tone?: "normal" | "error") => void statuses.push({ message, tone })),
    syncAuthOverlay: vi.fn()
  };
  return { deps, statuses };
};

afterEach(() => vi.clearAllMocks());

describe("createSsoSignInHandler", () => {
  it("opens the Twitch popup and logs the sign-up under the oidc.twitch method", async () => {
    const credential = {} as UserCredential;
    vi.mocked(signInWithPopup).mockResolvedValueOnce(credential);
    const { deps, statuses } = makeDeps();

    await createSsoSignInHandler(deps, twitch)();

    expect(signInWithPopup).toHaveBeenCalledWith(deps.firebaseAuth, twitch.provider);
    expect(logSignUpIfNewUser).toHaveBeenCalledWith(undefined, credential, "oidc.twitch");
    expect(statuses.at(-1)?.message).toBe("Twitch sign-in complete. Authorizing empire...");
    // Stays busy on success: onAuthStateChanged takes over from here.
    expect(deps.setAuthBusy).not.toHaveBeenCalledWith(false);
  });

  it("clears busy and reports the error when the popup fails (e.g. provider not enabled in Firebase yet)", async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce(Object.assign(new Error("Firebase: Error (auth/operation-not-allowed)."), { code: "auth/operation-not-allowed" }));
    const { deps, statuses } = makeDeps();

    await createSsoSignInHandler(deps, twitch)();

    expect(deps.setAuthBusy).toHaveBeenLastCalledWith(false);
    expect(statuses.at(-1)).toEqual({ message: "Firebase: Error (auth/operation-not-allowed).", tone: "error" });
  });

  it("steers in-app browser users to a real browser without opening the popup", async () => {
    const { deps, statuses } = makeDeps("Mozilla/5.0 Instagram 300.0");

    await createSsoSignInHandler(deps, twitch)();

    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(statuses.at(-1)?.message).toContain("Twitch sign-in doesn't work inside the Instagram in-app browser");
  });

  it("does nothing when the provider is not configured", async () => {
    const { deps } = makeDeps();
    await createSsoSignInHandler(deps, undefined)();
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(deps.setAuthBusy).not.toHaveBeenCalled();
  });
});

describe("ssoSignInErrorMessage", () => {
  it("explains an email collision with an existing account instead of Firebase's raw code", () => {
    const error = Object.assign(new Error("Firebase: Error (auth/account-exists-with-different-credential)."), { code: "auth/account-exists-with-different-credential" });
    expect(ssoSignInErrorMessage(error, "Twitch")).toContain("already used by another sign-in method");
  });

  it("names the provider in the blocked-storage message", () => {
    expect(ssoSignInErrorMessage(new Error("Unable to process request due to missing initial state."), "Twitch")).toMatch(/^Twitch sign-in failed because this browser blocked/);
  });
});

describe("signInProviderLabel", () => {
  const userWith = (...providerIds: string[]) => ({ providerData: providerIds.map((providerId) => ({ providerId })) }) as Parameters<typeof signInProviderLabel>[0];

  it("names the provider the user signed in with", () => {
    expect(signInProviderLabel(userWith(TWITCH_PROVIDER_ID))).toBe("Twitch");
    expect(signInProviderLabel(userWith("oidc.discord"))).toBe("Discord");
    expect(signInProviderLabel(userWith("google.com"))).toBe("Google");
    expect(signInProviderLabel(userWith("password"))).toBe("account");
  });
});
