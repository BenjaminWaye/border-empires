// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("../client-account-deletion/client-account-deletion.js", () => ({ openAccountDeletion: vi.fn() }));
vi.mock("../client-account-deletion/client-account-deletion.css", () => ({}));
vi.mock("../client-guest-save/client-guest-save-panel.js", () => ({ openGuestSavePanel: vi.fn() }));

import { signOut } from "firebase/auth";
import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";
import { bindAccountSettingsControls, GUEST_LOGOUT_WARNING } from "./client-account-settings-controls.js";

const clickLogout = async (isAnonymous: boolean): Promise<void> => {
  const root = document.createElement("div");
  root.innerHTML = `<button type="button" data-auth-logout>Log Out</button>`;
  bindAccountSettingsControls(root, { currentUser: { isAnonymous } } as never, {} as never, "ws://x", () => {});
  await root.querySelector<HTMLButtonElement>("[data-auth-logout]")!.onclick!({} as never);
};

describe("Log Out button", () => {
  let reload: ReturnType<typeof vi.fn>;
  const realLocation = Object.getOwnPropertyDescriptor(window, "location");
  beforeEach(() => {
    vi.mocked(signOut).mockClear();
    vi.mocked(openGuestSavePanel).mockClear();
    reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { reload } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (realLocation) Object.defineProperty(window, "location", realLocation);
  });

  it("warns a guest that the empire will be lost and offers the save panel if they cancel", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await clickLogout(true);
    expect(confirm).toHaveBeenCalledWith(GUEST_LOGOUT_WARNING);
    expect(signOut).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(openGuestSavePanel).toHaveBeenCalledTimes(1);
  });

  it("signs a guest out once they accept the warning", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await clickLogout(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not warn a signed-in account", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await clickLogout(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
