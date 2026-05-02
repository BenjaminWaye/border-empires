import { describe, expect, it } from "vitest";

import { buildPlayerRespawnNotice } from "./server-player-respawn-notice.js";

describe("server player respawn notice", () => {
  it("builds elimination notices with spawn diagnostics", () => {
    const notice = buildPlayerRespawnNotice({
      player: {
        id: "p1",
        name: "Ada",
        points: 70,
        level: 1,
        techIds: new Set(),
        domainIds: new Set(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        powerups: {},
        missions: [],
        missionStats: {
          neutralCaptures: 0,
          enemyCaptures: 0,
          combatWins: 0,
          maxTilesHeld: 0,
          maxSettledTilesHeld: 0,
          maxFarmsHeld: 0,
          maxContinentsHeld: 0,
          maxTechPicks: 0
        },
        territoryTiles: new Set(["1,1"]),
        T: 1,
        E: 4,
        Ts: 1,
        Es: 4,
        stamina: 10,
        staminaUpdatedAt: 1,
        manpower: 10,
        manpowerUpdatedAt: 1,
        allies: new Set(),
        spawnShieldUntil: 1,
        isEliminated: false,
        respawnPending: false,
        lastActiveAt: 1,
        activityInbox: []
      },
      context: {
        at: 10,
        reasonCode: "eliminated",
        triggerEvent: "player_elimination_resolved",
        previousTerritoryTiles: 0,
        previousTerritoryStrength: 0,
        previousExposure: 4,
        wasEliminated: true,
        respawnPending: false,
        wasOnline: true,
        previousHomeTileKey: "8,9"
      },
      spawnTileKey: "10,12"
    });

    expect(notice.id).toContain("player_elimination_resolved");
    expect(notice.title).toContain("elimination");
    expect(notice.spawnTileKey).toBe("10,12");
    expect(notice.previousHomeTileKey).toBe("8,9");
    expect(notice.wasOnline).toBe(true);
  });
  it("describes auth recovery without claiming zero territory", () => {
    const notice = buildPlayerRespawnNotice({
      player: {
        id: "p2",
        name: "Ada",
        points: 70,
        level: 1,
        techIds: new Set(),
        domainIds: new Set(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        powerups: {},
        missions: [],
        missionStats: {
          neutralCaptures: 0,
          enemyCaptures: 0,
          combatWins: 0,
          maxTilesHeld: 0,
          maxSettledTilesHeld: 0,
          maxFarmsHeld: 0,
          maxContinentsHeld: 0,
          maxTechPicks: 0
        },
        territoryTiles: new Set(["1,1"]),
        T: 0,
        E: 4,
        Ts: 1,
        Es: 4,
        stamina: 10,
        staminaUpdatedAt: 1,
        manpower: 10,
        manpowerUpdatedAt: 1,
        allies: new Set(),
        spawnShieldUntil: 1,
        isEliminated: false,
        respawnPending: false,
        lastActiveAt: 1,
        activityInbox: []
      },
      context: {
        at: 10,
        reasonCode: "auth_recovery",
        triggerEvent: "auth_identity_triggered_respawn",
        previousTerritoryTiles: 1,
        previousTerritoryStrength: 0,
        previousExposure: 4,
        wasEliminated: false,
        respawnPending: false,
        previousHomeTileKey: "1,1"
      },
      spawnTileKey: "10,12"
    });

    expect(notice.summary).toContain("playable foothold");
    expect(notice.summary).not.toContain("zero territory");
  });

});
