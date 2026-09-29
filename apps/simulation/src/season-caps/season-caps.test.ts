import { describe, expect, it } from "vitest";

import { resolveSeasonCaps } from "./season-caps.js";

describe("resolveSeasonCaps", () => {
  it("resolves both caps from explicit options", () => {
    expect(resolveSeasonCaps({ maxSeasonPlayers: 50, maxSeasonGuests: 5 })).toEqual({ maxSeasonPlayers: 50, maxSeasonGuests: 5 });
  });

  it("falls back to each cap's own default when neither option is given", () => {
    const original = { players: process.env.SIMULATION_MAX_SEASON_PLAYERS, guests: process.env.SIMULATION_MAX_SEASON_GUESTS };
    delete process.env.SIMULATION_MAX_SEASON_PLAYERS;
    delete process.env.SIMULATION_MAX_SEASON_GUESTS;
    try {
      expect(resolveSeasonCaps({})).toEqual({ maxSeasonPlayers: 50, maxSeasonGuests: 10 });
    } finally {
      if (original.players === undefined) delete process.env.SIMULATION_MAX_SEASON_PLAYERS;
      else process.env.SIMULATION_MAX_SEASON_PLAYERS = original.players;
      if (original.guests === undefined) delete process.env.SIMULATION_MAX_SEASON_GUESTS;
      else process.env.SIMULATION_MAX_SEASON_GUESTS = original.guests;
    }
  });
});
