import { describe, expect, it, vi } from "vitest";

import { applyRespawnNoticeToState, normalizeRespawnNotice } from "./client-respawn-notice.js";
import { createInitialState } from "../client-state/client-state.js";

describe("client respawn notice", () => {
  it("normalizes a valid respawn notice payload", () => {
    const notice = normalizeRespawnNotice({
      id: "respawn-1",
      at: 100,
      reasonCode: "eliminated",
      title: "Respawned",
      summary: "summary",
      detail: "detail",
      triggerEvent: "player_elimination_resolved",
      playerId: "p1",
      playerName: "Ada",
      previousTerritoryTiles: 0,
      previousTerritoryStrength: 0,
      previousExposure: 4,
      wasEliminated: true,
      respawnPending: false,
      spawnTileKey: "10,12"
    });

    expect(notice?.spawnTileKey).toBe("10,12");
    expect(notice?.reasonCode).toBe("eliminated");
  });

  it("opens the overlay only once per respawn id", () => {
    const state = createInitialState();
    const pushFeedEntry = vi.fn();
    const notice = normalizeRespawnNotice({
      id: "respawn-1",
      at: 100,
      reasonCode: "auth_recovery",
      title: "Respawned",
      summary: "Recovered during sign-in.",
      detail: "detail",
      triggerEvent: "auth_identity_triggered_respawn",
      playerId: "p1",
      playerName: "Ada",
      previousTerritoryTiles: 0,
      previousTerritoryStrength: 0,
      previousExposure: 4,
      wasEliminated: false,
      respawnPending: true
    });

    expect(applyRespawnNoticeToState(state, notice, pushFeedEntry)).toBe(true);
    expect(state.respawnOverlayOpen).toBe(true);
    expect(pushFeedEntry).toHaveBeenCalledTimes(1);

    state.respawnOverlayOpen = false;
    expect(applyRespawnNoticeToState(state, notice, pushFeedEntry)).toBe(false);
    expect(state.respawnOverlayOpen).toBe(false);
    expect(pushFeedEntry).toHaveBeenCalledTimes(1);
  });

  const eliminatedNotice = (overrides: Record<string, unknown> = {}) =>
    normalizeRespawnNotice({
      id: "eliminated-1", at: 200, reasonCode: "eliminated", title: "t", summary: "s", detail: "d",
      triggerEvent: "lock-1", playerId: "p1", playerName: "Ada", previousTerritoryTiles: 0,
      previousTerritoryStrength: 0, previousExposure: 0, wasEliminated: false, respawnPending: true,
      spawnTileKey: "41,7", fellToPlayerId: "ai-3", ...overrides
    });

  it("says plainly who took the empire and where the new start is", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const state = createInitialState();
    state.playerNames.set("ai-3", "Vorn Dominion");
    const pushFeedEntry = vi.fn();
    expect(applyRespawnNoticeToState(state, eliminatedNotice(), pushFeedEntry)).toBe(true);
    expect(pushFeedEntry).toHaveBeenCalledWith(expect.objectContaining({
      title: "Your empire fell",
      text: "Your empire fell to Vorn Dominion. You've been given a new start at (41, 7)."
    }));
    vi.unstubAllGlobals();
  });

  it("shows an elimination notice once across reloads, not on every visit", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const pushFeedEntry = vi.fn();
    expect(applyRespawnNoticeToState(createInitialState(), eliminatedNotice(), pushFeedEntry)).toBe(true);
    // A reload starts from fresh client state, and the sim resends the same notice.
    const reloaded = createInitialState();
    expect(applyRespawnNoticeToState(reloaded, eliminatedNotice(), pushFeedEntry)).toBe(false);
    expect(reloaded.respawnOverlayOpen).toBe(false);
    expect(reloaded.respawnNotice?.id).toBe("eliminated-1");
    expect(pushFeedEntry).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("keeps withdrawal and unknown-captor notices accurate", () => {
    expect(normalizeRespawnNotice({ ...baseEliminated(), withdrawn: true })?.withdrawn).toBe(true);
  });
});

const baseEliminated = () => ({
  id: "x", at: 1, reasonCode: "eliminated", title: "t", summary: "s", detail: "d", triggerEvent: "e",
  playerId: "p1", playerName: "Ada", previousTerritoryTiles: 0, previousTerritoryStrength: 0,
  previousExposure: 0, wasEliminated: false, respawnPending: true
});

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
};
