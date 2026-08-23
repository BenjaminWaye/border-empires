import { describe, expect, it } from "vitest";

import { buildSeasonLobbyUpdatePayload } from "./season-lobby-broadcast.js";

describe("buildSeasonLobbyUpdatePayload", () => {
  it("shapes the broadcast payload from the roster", () => {
    const payload = buildSeasonLobbyUpdatePayload(
      [
        { playerId: "p1", name: "Alice", countryFlag: "US" },
        { playerId: "p2", name: "Bob" }
      ],
      120
    );
    expect(payload).toEqual({
      type: "SEASON_LOBBY_UPDATE",
      waitingCount: 2,
      maxPlayers: 120,
      roster: [
        { playerId: "p1", name: "Alice", countryFlag: "US" },
        { playerId: "p2", name: "Bob" }
      ]
    });
  });

  it("defaults maxPlayers from SIMULATION_MAX_SEASON_PLAYERS", () => {
    const original = process.env.SIMULATION_MAX_SEASON_PLAYERS;
    process.env.SIMULATION_MAX_SEASON_PLAYERS = "50";
    try {
      const payload = buildSeasonLobbyUpdatePayload([]);
      expect(payload.maxPlayers).toBe(50);
    } finally {
      if (original === undefined) delete process.env.SIMULATION_MAX_SEASON_PLAYERS;
      else process.env.SIMULATION_MAX_SEASON_PLAYERS = original;
    }
  });
});
