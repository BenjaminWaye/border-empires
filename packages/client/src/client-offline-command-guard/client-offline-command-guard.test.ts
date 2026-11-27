import { describe, expect, it, vi } from "vitest";
import { blockOfflineGameCommand, OFFLINE_COMMAND_TITLE } from "./client-offline-command-guard.js";

const NOW = 1_800_000_000_000;

// Playtest 2026-11-25 18:40: a staging deploy restarted the server mid-game;
// Explore + Go was refused only on the hidden sign-in status line, so nothing
// told the player. In game, a refused command now says "Server updating".
describe("blockOfflineGameCommand", () => {
  it("refuses an in-game command while the session is down and says so", () => {
    const showAlert = vi.fn();
    const state = { hasEverInitialized: true, connection: "disconnected" as const, deployStatus: { startedAt: NOW - 40_000, expectedSeconds: 120 } };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(showAlert).toHaveBeenCalledWith(OFFLINE_COMMAND_TITLE, "Server update · back in ~1:20", "warn");
  });

  it("falls back to Reconnecting… without a deploy status, and does not repeat within 4s", () => {
    const showAlert = vi.fn();
    const state = { hasEverInitialized: true, connection: "connecting" as const, deployStatus: null };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(blockOfflineGameCommand(state, showAlert, NOW + 1_000)).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(OFFLINE_COMMAND_TITLE, "Reconnecting…", "warn");
    blockOfflineGameCommand(state, showAlert, NOW + 4_000);
    expect(showAlert).toHaveBeenCalledTimes(2);
  });

  it("lets commands through once the session is live, and leaves sign-in to its own copy", () => {
    const showAlert = vi.fn();
    expect(blockOfflineGameCommand({ hasEverInitialized: true, connection: "initialized" }, showAlert, NOW)).toBe(false);
    expect(blockOfflineGameCommand({ hasEverInitialized: false, connection: "disconnected" }, showAlert, NOW)).toBe(false);
    expect(showAlert).not.toHaveBeenCalled();
  });
});
