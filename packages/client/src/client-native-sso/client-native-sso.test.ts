import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    signInWithOpenIdConnect: vi.fn(),
    revokeAccessToken: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined)
  }
}));

vi.mock("firebase/auth", () => {
  class OAuthProvider {
    constructor(readonly providerId: string) {}
    credential(params: Record<string, string>) {
      return { providerId: this.providerId, ...params };
    }
  }
  return {
    OAuthProvider,
    GoogleAuthProvider: { credential: (idToken: string | null, accessToken: string | null) => ({ providerId: "google.com", idToken, accessToken }) },
    signInWithCredential: vi.fn(async (_auth: unknown, credential: unknown) => ({ credential })),
    linkWithCredential: vi.fn(async (_user: unknown, credential: unknown) => ({ credential })),
    reauthenticateWithCredential: vi.fn(async (_user: unknown, credential: unknown) => ({ credential }))
  };
});

const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
const { linkWithCredential, reauthenticateWithCredential, signInWithCredential } = await import("firebase/auth");
const sso = await import("./client-native-sso.js");

beforeEach(() => vi.clearAllMocks());

describe("webCredentialFromNativeResult", () => {
  it("builds a Google credential from the native ID token", () => {
    const credential = sso.webCredentialFromNativeResult("google.com", { user: null, additionalUserInfo: null, credential: { providerId: "google.com", idToken: "g-id" } });
    expect(credential).toMatchObject({ providerId: "google.com", idToken: "g-id" });
  });

  it("passes Apple's raw nonce so Firebase can verify the hashed nonce in the token", () => {
    const credential = sso.webCredentialFromNativeResult("apple.com", { user: null, additionalUserInfo: null, credential: { providerId: "apple.com", idToken: "a-id", nonce: "raw" } });
    expect(credential).toEqual({ providerId: "apple.com", idToken: "a-id", rawNonce: "raw" });
  });

  it("keeps both OIDC tokens for Twitch/Discord", () => {
    const credential = sso.webCredentialFromNativeResult("oidc.twitch", { user: null, additionalUserInfo: null, credential: { providerId: "oidc.twitch", idToken: "t-id", accessToken: "t-at" } });
    expect(credential).toEqual({ providerId: "oidc.twitch", idToken: "t-id", accessToken: "t-at" });
  });

  it("rejects a result with no tokens instead of signing in with an empty credential", () => {
    expect(() => sso.webCredentialFromNativeResult("google.com", { user: null, additionalUserInfo: null, credential: null })).toThrow("no credential");
  });
});

describe("native SSO flows", () => {
  it("signs the web SDK in with Google's credential without a native session", async () => {
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockResolvedValueOnce({ user: null, additionalUserInfo: null, credential: { providerId: "google.com", idToken: "g-id" } });
    await sso.signInWithNativeSso({} as never, "google.com");
    expect(FirebaseAuthentication.signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(signInWithCredential).toHaveBeenCalledWith({}, expect.objectContaining({ idToken: "g-id" }));
    expect(FirebaseAuthentication.signOut).not.toHaveBeenCalled();
  });

  it("asks Twitch for the same email claims as the web provider and drops the native session afterwards", async () => {
    vi.mocked(FirebaseAuthentication.signInWithOpenIdConnect).mockResolvedValueOnce({ user: null, additionalUserInfo: null, credential: { providerId: "oidc.twitch", idToken: "t-id" } });
    await sso.signInWithNativeSso({} as never, "oidc.twitch");
    const options = vi.mocked(FirebaseAuthentication.signInWithOpenIdConnect).mock.calls[0]?.[0];
    expect(options).toMatchObject({ providerId: "oidc.twitch", skipNativeAuth: false, scopes: ["openid", "user:read:email"] });
    expect(options?.customParameters?.[0]?.key).toBe("claims");
    expect(FirebaseAuthentication.signOut).toHaveBeenCalledOnce();
  });

  it("links a guest with the native credential rather than replacing its UID", async () => {
    vi.mocked(FirebaseAuthentication.signInWithApple).mockResolvedValueOnce({ user: null, additionalUserInfo: null, credential: { providerId: "apple.com", idToken: "a-id", nonce: "n" } });
    const guest = { uid: "guest" };
    await sso.linkWithNativeSso(guest as never, "apple.com");
    expect(linkWithCredential).toHaveBeenCalledWith(guest, { providerId: "apple.com", idToken: "a-id", rawNonce: "n" });
  });

  it("revokes Apple authorization only after reauthenticating the matching UID", async () => {
    const user = { uid: "player" };
    vi.mocked(FirebaseAuthentication.signInWithApple).mockResolvedValueOnce({
      user: user as never,
      additionalUserInfo: null,
      credential: { providerId: "apple.com", idToken: "a-id", nonce: "n", authorizationCode: "code" }
    });
    await sso.reauthenticateAndRevokeNativeApple(user as never);
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, { providerId: "apple.com", idToken: "a-id", rawNonce: "n" });
    expect(FirebaseAuthentication.revokeAccessToken).toHaveBeenCalledWith({ token: "code" });
    expect(FirebaseAuthentication.signOut).toHaveBeenCalledOnce();
  });

  it("does not revoke a different account and clears the native session", async () => {
    vi.mocked(FirebaseAuthentication.signInWithApple).mockResolvedValueOnce({
      user: { uid: "different" } as never,
      additionalUserInfo: null,
      credential: { providerId: "apple.com", idToken: "a-id", authorizationCode: "code" }
    });
    await expect(sso.reauthenticateAndRevokeNativeApple({ uid: "player" } as never)).rejects.toThrow("linked to this empire");
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(FirebaseAuthentication.revokeAccessToken).not.toHaveBeenCalled();
    expect(FirebaseAuthentication.signOut).toHaveBeenCalledOnce();
  });

  it("reports a backed-out sign-in as a cancellation, not an error", async () => {
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockRejectedValueOnce(new Error("The user canceled the sign-in flow."));
    await expect(sso.nativeSsoCredential("google.com")).rejects.toBeInstanceOf(sso.NativeSsoCancelledError);
  });

  it("does not suppress Google errors when no saved credential is available", async () => {
    const noCredentials = new Error("No credentials available");
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockRejectedValueOnce(noCredentials);
    await expect(sso.nativeSsoCredential("google.com")).rejects.toThrow("Add a Google account or choose another sign-in method");
  });

  it("keeps real provider failures as errors", async () => {
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockRejectedValueOnce(new Error("DEVELOPER_ERROR"));
    await expect(sso.nativeSsoCredential("google.com")).rejects.toThrow("DEVELOPER_ERROR");
  });
});
