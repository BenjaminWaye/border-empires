import { describe, expect, it } from "vitest";
import { findMostDeadlyTile } from "../season-stats/season-stats.js";
import { MAX_PLAYERS_PER_COMBAT_TILE, MAX_SEASON_TILE_PLAYER_ENTRIES, recordSeasonTileLoss, seasonTilePlayerLossGauge } from "./season-tile-player-losses.js";

describe("season-wide per-player tile losses", () => {
  it("accumulates separate players and tiles, then identifies the most losses on the deadliest tile", () => {
    const totals = new Map<string, number>();
    recordSeasonTileLoss(totals, "1,2", "p1", 100);
    recordSeasonTileLoss(totals, "1,2", "p2", 150);
    recordSeasonTileLoss(totals, "1,2", "p1", 100);
    recordSeasonTileLoss(totals, "3,4", "p2", 300);
    expect(findMostDeadlyTile(totals, [{ id: "p1", name: "Waypoint" }])).toEqual({
      x: 1, y: 2, manpowerLost: 350,
      mostLossesPlayer: { playerId: "p1", playerName: "Waypoint", manpowerLost: 200 }
    });
    expect(findMostDeadlyTile(new Map())).toBeUndefined();
  });

  it("does not claim a player winner when older losses cannot be attributed", () => {
    const totals = new Map([["1,2", 1000]]);
    recordSeasonTileLoss(totals, "1,2", "p1", 50);
    expect(findMostDeadlyTile(totals)).toEqual({ x: 1, y: 2, manpowerLost: 1050 });
  });

  it("bounds players per tile and reports cap hits without fabricating a leader", () => {
    const totals = new Map<string, number>();
    for (let i = 0; i <= MAX_PLAYERS_PER_COMBAT_TILE; i++) recordSeasonTileLoss(totals, "1,2", `p${i}`, 1);
    expect(seasonTilePlayerLossGauge(totals)).toMatchObject({ playerEntries: MAX_PLAYERS_PER_COMBAT_TILE, capHits: 1 });
    expect(findMostDeadlyTile(totals)?.mostLossesPlayer).toBeUndefined();
  });

  it("bounds the whole season's attribution structures", () => {
    const totals = new Map<string, number>();
    for (let i = 0; i <= MAX_SEASON_TILE_PLAYER_ENTRIES; i++) recordSeasonTileLoss(totals, `${i},0`, "p1", 1);
    expect(seasonTilePlayerLossGauge(totals)).toEqual({
      tileEntries: MAX_SEASON_TILE_PLAYER_ENTRIES, playerEntries: MAX_SEASON_TILE_PLAYER_ENTRIES, capHits: 1
    });
  });
});
