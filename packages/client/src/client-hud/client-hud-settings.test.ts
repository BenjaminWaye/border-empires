import { describe, expect, it, vi } from "vitest";
import { updateSettingsDisplayName } from "./client-hud-settings.js";

describe("updateSettingsDisplayName", () => {
  it("always forwards the player's current color on SET_PROFILE, never sending displayName alone", async () => {
    // Regression guard: the gateway's SET_PROFILE handler normalizes
    // message.color unconditionally and rejects/throws when it is missing,
    // so a display-name-only update must still include the current color.
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const pushFeed = vi.fn();
    const updateFirebaseDisplayName = vi.fn().mockResolvedValue(undefined);

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName,
      pushFeed
    });

    expect(sendGameMessage).toHaveBeenCalledWith(
      { type: "SET_PROFILE", displayName: "New Name", color: "#38b000" },
      expect.any(String)
    );
  });

  it("rejects names under 2 characters without sending anything", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const pushFeed = vi.fn();

    await updateSettingsDisplayName("a", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName: vi.fn(),
      pushFeed
    });

    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("at least 2 characters"), "error", "warn");
  });

  it("no-ops when the trimmed name matches the current name", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const pushFeed = vi.fn();

    await updateSettingsDisplayName("  Old Name  ", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName: vi.fn(),
      pushFeed
    });

    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("unchanged"), "info", "info");
  });

  it("does not update Firebase or report success when sendGameMessage rejects (not authed)", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(false);
    const pushFeed = vi.fn();
    const updateFirebaseDisplayName = vi.fn().mockResolvedValue(undefined);

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName,
      pushFeed
    });

    expect(updateFirebaseDisplayName).not.toHaveBeenCalled();
    expect(pushFeed).not.toHaveBeenCalledWith(expect.stringContaining("updated"), expect.anything(), expect.anything());
  });
});
