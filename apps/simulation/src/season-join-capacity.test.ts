import { afterEach, describe, expect, it } from "vitest";
import { resolveMaxSeasonPlayers, seasonIsAtPlayerCap } from "./season-join-capacity.js";

describe("resolveMaxSeasonPlayers", () => {
  const originalEnv = process.env.SIMULATION_MAX_SEASON_PLAYERS;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SIMULATION_MAX_SEASON_PLAYERS;
    else process.env.SIMULATION_MAX_SEASON_PLAYERS = originalEnv;
  });

  it("defaults to 50 when unset", () => {
    delete process.env.SIMULATION_MAX_SEASON_PLAYERS;
    expect(resolveMaxSeasonPlayers(undefined)).toBe(50);
  });

  it("prefers an explicitly configured value over the env var", () => {
    process.env.SIMULATION_MAX_SEASON_PLAYERS = "50";
    expect(resolveMaxSeasonPlayers(200)).toBe(200);
  });

  it("falls back to the env var when no explicit value is configured", () => {
    process.env.SIMULATION_MAX_SEASON_PLAYERS = "50";
    expect(resolveMaxSeasonPlayers(undefined)).toBe(50);
  });
});

describe("seasonIsAtPlayerCap", () => {
  it("is false for a returning player who already has runtime territory, even at cap", () => {
    const runtime = { hasPlayer: () => true, humanPlayerCount: () => 120 };
    expect(seasonIsAtPlayerCap(120, runtime, "returning-player")).toBe(false);
  });

  it("is true for a genuinely new player once humanPlayerCount reaches the cap", () => {
    const runtime = { hasPlayer: () => false, humanPlayerCount: () => 120 };
    expect(seasonIsAtPlayerCap(120, runtime, "new-player")).toBe(true);
  });

  it("is false for a new player below the cap", () => {
    const runtime = { hasPlayer: () => false, humanPlayerCount: () => 119 };
    expect(seasonIsAtPlayerCap(120, runtime, "new-player")).toBe(false);
  });
});
