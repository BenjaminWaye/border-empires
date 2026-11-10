// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth, linkWithCredential } from "firebase/auth";
import { nativeGuestSaveErrorMessage, saveNativeGuest, saveNativeGuestWithProvider } from "./client-native-guest-save.js";
import { linkWithNativeSso } from "../client-native-sso/client-native-sso.js";

vi.mock("../client-native-sso/client-native-sso.js", () => ({ linkWithNativeSso: vi.fn(async () => ({})) }));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  linkWithCredential: vi.fn(),
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) }
}));

describe("native guest save", () => {
  const user = { uid: "same-guest", isAnonymous: true, getIdToken: vi.fn(async () => "fresh") };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue({ currentUser: user, authStateReady: vi.fn(async () => undefined) } as never);
    vi.mocked(linkWithCredential).mockResolvedValue({ user } as never);
  });
  it("links email credentials to the existing guest and refreshes its token", async () => {
    await saveNativeGuest(" player@example.com ", "secret123");
    expect(linkWithCredential).toHaveBeenCalledWith(user, { email: "player@example.com", password: "secret123" });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });
  it("preserves the guest when that email already belongs to another account", async () => {
    vi.mocked(linkWithCredential).mockRejectedValueOnce({ code: "auth/email-already-in-use" });
    await expect(saveNativeGuest("taken@example.com", "secret123")).rejects.toEqual({ code: "auth/email-already-in-use" });
    expect(getAuth().currentUser).toBe(user);
    expect(user.getIdToken).not.toHaveBeenCalled();
  });
  it("can finish saving when token refresh fails after credentials were linked", async () => {
    user.getIdToken.mockRejectedValueOnce(new Error("offline"));
    await expect(saveNativeGuest("player@example.com", "secret123")).resolves.toBeUndefined();
    expect(linkWithCredential).toHaveBeenCalledOnce();
  });
  it("refuses to link credentials to a signed-in non-guest", async () => {
    vi.mocked(getAuth).mockReturnValue({ currentUser: { ...user, isAnonymous: false }, authStateReady: async () => undefined } as never);
    await expect(saveNativeGuest("player@example.com", "secret123")).rejects.toThrow("no longer available");
    expect(linkWithCredential).not.toHaveBeenCalled();
  });
  it("links Google to the existing guest UID and refreshes its token", async () => {
    await saveNativeGuestWithProvider("google.com");
    expect(linkWithNativeSso).toHaveBeenCalledWith(user, "google.com");
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });
  it("refuses to link a provider to a signed-in non-guest", async () => {
    vi.mocked(getAuth).mockReturnValue({ currentUser: { ...user, isAnonymous: false }, authStateReady: async () => undefined } as never);
    await expect(saveNativeGuestWithProvider("apple.com")).rejects.toThrow("no longer available");
    expect(linkWithNativeSso).not.toHaveBeenCalled();
  });
  it("explains an account collision instead of showing Firebase's code", () => {
    expect(nativeGuestSaveErrorMessage({ code: "auth/credential-already-in-use" }, "Google account")).toBe(
      "That Google account already has an account. Use a different one to keep this guest empire."
    );
  });
});
