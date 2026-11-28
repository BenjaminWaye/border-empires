import { describe, expect, it, vi } from "vitest";
import { blockOfflineGameCommand, dropOfflineNoticeUnderReconnectOverlay, OFFLINE_COMMAND_TITLE } from "./client-offline-command-guard.js";

const NOW = 1_800_000_000_000;

// Fields the reconnect overlay reads. disconnectedSince = NOW keeps the
// overlay inside its grace window (not showing) unless a test says otherwise.
const overlayFields = {
  firstChunkAt: 1,
  disconnectedSince: NOW,
  seasonPending: false,
  needsSeasonJoin: false,
  joinSeasonOverlayOpen: false
};

// Playtest 2026-11-25 18:40: a staging deploy restarted the server mid-game;
// Explore + Go was refused only on the hidden sign-in status line, so nothing
// told the player. In game, a refused command now says "Server updating".
describe("blockOfflineGameCommand", () => {
  it("refuses an in-game command while the session is down and says so", () => {
    const showAlert = vi.fn();
    const state = {
      ...overlayFields,
      hasEverInitialized: true,
      connection: "disconnected" as const,
      deployStatus: { startedAt: NOW - 40_000, expectedSeconds: 120 }
    };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(showAlert).toHaveBeenCalledWith(OFFLINE_COMMAND_TITLE, "Server update · back in ~1:20", "warn");
  });

  it("falls back to Reconnecting… without a deploy status, and does not repeat within 4s", () => {
    const showAlert = vi.fn();
    const state = { ...overlayFields, hasEverInitialized: true, connection: "connecting" as const, deployStatus: null };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(blockOfflineGameCommand(state, showAlert, NOW + 1_000)).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(OFFLINE_COMMAND_TITLE, "Reconnecting…", "warn");
    // A fresh blip later on (overlay grace restarts from it) notifies again.
    state.disconnectedSince = NOW + 4_000;
    blockOfflineGameCommand(state, showAlert, NOW + 4_000);
    expect(showAlert).toHaveBeenCalledTimes(2);
  });

  it("lets commands through once the session is live, and leaves sign-in to its own copy", () => {
    const showAlert = vi.fn();
    expect(blockOfflineGameCommand({ ...overlayFields, hasEverInitialized: true, connection: "initialized" }, showAlert, NOW)).toBe(false);
    expect(blockOfflineGameCommand({ ...overlayFields, hasEverInitialized: false, connection: "disconnected" }, showAlert, NOW)).toBe(false);
    expect(showAlert).not.toHaveBeenCalled();
  });
});

// Playtest 2026-11-28: tapping an action while "Disconnected from server"
// was showing stacked a second "Server updating / Reconnecting…" card on it.
describe("offline notice vs the reconnect overlay", () => {
  const overlayUp = {
    ...overlayFields,
    hasEverInitialized: true,
    connection: "disconnected" as const,
    deployStatus: null,
    disconnectedSince: NOW - 5_000
  };
  const offlineNotice = () => ({ title: OFFLINE_COMMAND_TITLE, detail: "Reconnecting…", until: NOW + 12_000, tone: "warn" as const });

  it("refuses silently while the reconnect overlay already says the session is down", () => {
    const showAlert = vi.fn();
    expect(blockOfflineGameCommand({ ...overlayUp }, showAlert, NOW)).toBe(true);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("still notifies inside the overlay's grace window, then expires the notice once the overlay shows", () => {
    const showAlert = vi.fn();
    const state = { ...overlayUp, disconnectedSince: NOW - 200, captureAlert: offlineNotice() };
    expect(blockOfflineGameCommand(state, showAlert, NOW)).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    dropOfflineNoticeUnderReconnectOverlay(state, NOW);
    expect(state.captureAlert.until).toBe(NOW + 12_000);
    dropOfflineNoticeUnderReconnectOverlay(state, NOW + 2_000);
    expect(state.captureAlert.until).toBe(NOW + 2_000);
  });

  it("expires the notice when the session comes back inside the grace window", () => {
    const state = { ...overlayUp, connection: "initialized" as const, disconnectedSince: 0, captureAlert: offlineNotice() };
    dropOfflineNoticeUnderReconnectOverlay(state, NOW);
    expect(state.captureAlert.until).toBe(NOW);
  });

  it("leaves other alerts alone under the overlay", () => {
    const state = { ...overlayUp, captureAlert: { ...offlineNotice(), title: "Attack failed" } };
    dropOfflineNoticeUnderReconnectOverlay(state, NOW);
    expect(state.captureAlert.until).toBe(NOW + 12_000);
  });
});
