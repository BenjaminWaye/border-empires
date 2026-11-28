import { describe, expect, it, vi } from "vitest";
import { blockOfflineGameCommand, dropOfflineNoticeUnderReconnectOverlay, OFFLINE_COMMAND_TITLE } from "./client-offline-command-guard.js";

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

  // Playtest 2026-11-28: tapping an action while "Disconnected from server"
  // was showing stacked a second "Server updating / Reconnecting…" card on it.
  const overlayUp = {
    hasEverInitialized: true,
    connection: "disconnected" as const,
    deployStatus: null,
    firstChunkAt: 1,
    disconnectedSince: NOW - 5_000,
    seasonPending: false,
    needsSeasonJoin: false,
    joinSeasonOverlayOpen: false
  };

  it("refuses silently while the reconnect overlay already says the session is down", () => {
    const showAlert = vi.fn();
    expect(blockOfflineGameCommand({ ...overlayUp }, showAlert, NOW)).toBe(true);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("still notifies inside the overlay's grace window, then drops the notice once the overlay shows", () => {
    const showAlert = vi.fn();
    const state = { ...overlayUp, disconnectedSince: NOW - 200 };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    const withAlert = { ...state, captureAlert: { title: OFFLINE_COMMAND_TITLE, detail: "Reconnecting…", until: NOW + 5_000, tone: "warn" as const } };
    dropOfflineNoticeUnderReconnectOverlay(withAlert, NOW);
    expect(withAlert.captureAlert).toBeDefined();
    dropOfflineNoticeUnderReconnectOverlay(withAlert, NOW + 2_000);
    expect(withAlert.captureAlert).toBeUndefined();
  });

  it("leaves other alerts alone under the overlay", () => {
    const state = { ...overlayUp, captureAlert: { title: "Attack failed", detail: "x", until: NOW + 5_000, tone: "error" as const } };
    dropOfflineNoticeUnderReconnectOverlay(state, NOW);
    expect(state.captureAlert).toBeDefined();
  });
});
