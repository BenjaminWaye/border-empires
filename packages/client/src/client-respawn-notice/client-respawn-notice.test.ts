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
});
