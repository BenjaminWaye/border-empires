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
    const setPendingDisplayNameChange = vi.fn();

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName,
      pushFeed,
      setPendingDisplayNameChange
    });

    expect(sendGameMessage).toHaveBeenCalledWith(
      { type: "SET_PROFILE", displayName: "New Name", color: "#38b000" },
      expect.any(String)
    );
  });

  it("marks the name pending before sending, and does not claim success on its own (server confirms via PLAYER_UPDATE)", async () => {
    // Regression guard: the gateway can still reject SET_PROFILE server-side
    // (e.g. a stale color collision) even though the socket send succeeded,
    // so this function must not push a success message itself — client-network
    // owns that once the matching PLAYER_UPDATE / ERROR actually arrives.
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const pushFeed = vi.fn();
    const updateFirebaseDisplayName = vi.fn().mockResolvedValue(undefined);
    const setPendingDisplayNameChange = vi.fn();

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName,
      pushFeed,
      setPendingDisplayNameChange
    });

    expect(setPendingDisplayNameChange).toHaveBeenCalledWith("New Name");
    expect(pushFeed).not.toHaveBeenCalledWith(expect.stringContaining("updated"), expect.anything(), expect.anything());
  });

  it("clears the pending name and pushes a feed message when sendGameMessage fails synchronously", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(false);
    const pushFeed = vi.fn();
    const setPendingDisplayNameChange = vi.fn();

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName: vi.fn(),
      pushFeed,
      setPendingDisplayNameChange
    });

    expect(setPendingDisplayNameChange).toHaveBeenNthCalledWith(1, "New Name");
    expect(setPendingDisplayNameChange).toHaveBeenNthCalledWith(2, "");
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Finish sign-in"), "error", "warn");
  });

  it("rejects names under 2 characters without sending anything", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const pushFeed = vi.fn();

    await updateSettingsDisplayName("a", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName: vi.fn(),
      pushFeed,
      setPendingDisplayNameChange: vi.fn()
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
      pushFeed,
      setPendingDisplayNameChange: vi.fn()
    });

    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("unchanged"), "info", "info");
  });

  it("does not update Firebase and pushes a feed message when sendGameMessage rejects (not authed)", async () => {
    const sendGameMessage = vi.fn().mockReturnValue(false);
    const pushFeed = vi.fn();
    const updateFirebaseDisplayName = vi.fn().mockResolvedValue(undefined);

    await updateSettingsDisplayName("New Name", {
      currentName: "Old Name",
      currentColor: "#38b000",
      sendGameMessage,
      updateFirebaseDisplayName,
      pushFeed,
      setPendingDisplayNameChange: vi.fn()
    });

    expect(updateFirebaseDisplayName).not.toHaveBeenCalled();
    expect(pushFeed).not.toHaveBeenCalledWith(expect.stringContaining("updated"), expect.anything(), expect.anything());
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Finish sign-in"), "error", "warn");
  });
});
