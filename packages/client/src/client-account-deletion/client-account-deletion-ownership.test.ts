import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ platform: "web" }));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.platform !== "web", getPlatform: () => native.platform } }));
vi.mock("../client-native-sso/client-native-sso.js", () => ({ reauthenticateWithNativeSso: vi.fn(async () => ({})), reauthenticateAndRevokeNativeApple: vi.fn(async () => undefined) }));
vi.mock("firebase/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/auth")>(),
  reauthenticateWithPopup: vi.fn(async () => ({}))
}));

const { reauthenticateWithPopup } = await import("firebase/auth");
const { reauthenticateAndRevokeNativeApple, reauthenticateWithNativeSso } = await import("../client-native-sso/client-native-sso.js");
const { confirmOwnership } = await import("./client-account-deletion.js");

const userWith = (...providers: string[]) => ({ isAnonymous: false, email: "p@example.com", providerData: providers.map((providerId) => ({ providerId })) }) as never;

beforeEach(() => { vi.clearAllMocks(); native.platform = "web"; });

describe("deletion ownership check", () => {
  it.each(["google.com", "oidc.twitch", "oidc.discord"])("reauthenticates a %s account natively inside the app", async (providerId) => {
    native.platform = "ios";
    const user = userWith(providerId);
    await confirmOwnership(user, "");
    expect(reauthenticateWithNativeSso).toHaveBeenCalledWith(user, providerId);
    expect(reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it("revokes Apple before deleting an Apple-linked account with another sign-in method", async () => {
    native.platform = "ios";
    const user = userWith("password", "google.com", "apple.com");
    await confirmOwnership(user, "");
    expect(reauthenticateAndRevokeNativeApple).toHaveBeenCalledWith(user);
    expect(reauthenticateWithNativeSso).not.toHaveBeenCalled();
  });

  it("still uses the popup on the web for Google", async () => {
    await confirmOwnership(userWith("google.com"), "");
    expect(reauthenticateWithPopup).toHaveBeenCalledOnce();
    expect(reauthenticateWithNativeSso).not.toHaveBeenCalled();
  });

  it("sends Apple accounts to the iOS app on the web, where Apple sign-in does not exist", async () => {
    await expect(confirmOwnership(userWith("apple.com"), "")).rejects.toThrow("iOS app");
  });
});
