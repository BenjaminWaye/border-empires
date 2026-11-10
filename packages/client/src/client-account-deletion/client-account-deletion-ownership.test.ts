import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ value: false }));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock("../client-native-sso/client-native-sso.js", () => ({ reauthenticateWithNativeSso: vi.fn(async () => ({})) }));
vi.mock("firebase/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/auth")>(),
  reauthenticateWithPopup: vi.fn(async () => ({}))
}));

const { reauthenticateWithPopup } = await import("firebase/auth");
const { reauthenticateWithNativeSso } = await import("../client-native-sso/client-native-sso.js");
const { confirmOwnership } = await import("./client-account-deletion.js");

const userWith = (providerId: string) => ({ isAnonymous: false, email: "p@example.com", providerData: [{ providerId }] }) as never;

beforeEach(() => { vi.clearAllMocks(); native.value = false; });

describe("deletion ownership check", () => {
  it.each(["google.com", "apple.com", "oidc.twitch", "oidc.discord"])("reauthenticates a %s account natively inside the app", async (providerId) => {
    native.value = true;
    const user = userWith(providerId);
    await confirmOwnership(user, "");
    expect(reauthenticateWithNativeSso).toHaveBeenCalledWith(user, providerId);
    expect(reauthenticateWithPopup).not.toHaveBeenCalled();
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
