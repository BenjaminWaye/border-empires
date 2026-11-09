import { describe, expect, it } from "vitest";
import { recoverTilePlayerLosses } from "./recover-tile-player-losses.js";
import { recordSeasonTileLoss } from "./season-tile-player-losses.js";
import { findMostDeadlyTile } from "../season-stats/season-stats.js";

describe("recover older tile attribution from retained combat logs", () => {
  const logs = [
    { attackerId: "p1", x: 1, y: 2, manpowerLoss: 100 },
    { attackerId: "p2", x: 1, y: 2, manpowerLoss: 200 },
    { attackerId: "p1", x: 1, y: 2, manpowerLoss: 150 }
  ];
  it("recovers complete older records and remains idempotent", () => {
    const totals = new Map([["1,2", 450]]);
    recoverTilePlayerLosses(totals, logs);
    recoverTilePlayerLosses(totals, logs);
    expect(findMostDeadlyTile(totals)?.mostLossesPlayer).toMatchObject({ playerId: "p1", manpowerLost: 250 });
    expect(totals.get("1,2")).toBe(450);
  });
  it("does not claim a season leader from only the recent part of history", () => {
    const totals = new Map([["1,2", 900]]);
    recoverTilePlayerLosses(totals, logs);
    expect(findMostDeadlyTile(totals)?.mostLossesPlayer).toBeUndefined();
  });
  it("preserves a complete durable record over a smaller rolling log", () => {
    const totals = new Map<string, number>();
    recordSeasonTileLoss(totals, "1,2", "p2", 1000);
    recordSeasonTileLoss(totals, "1,2", "p1", 250);
    recoverTilePlayerLosses(totals, logs);
    expect(findMostDeadlyTile(totals)?.mostLossesPlayer).toMatchObject({ playerId: "p2", manpowerLost: 1000 });
  });
});
