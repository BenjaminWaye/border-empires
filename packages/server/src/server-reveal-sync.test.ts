import { describe, expect, it, vi } from "vitest";

import type { Tile } from "@border-empires/shared";

import { buildForcedRevealTileUpdates, syncForcedRevealTileUpdatesForPlayer } from "./server-reveal-sync.js";

const parseKey = (tileKey: string): [number, number] => {
  const [xText, yText] = tileKey.split(",");
  return [Number(xText), Number(yText)];
};

describe("server-reveal-sync", () => {
  it("builds unfogged tile updates once per revealed tile key", () => {
    const playerTile = vi.fn((x: number, y: number): Tile => ({
      x,
      y,
      terrain: "LAND",
      fogged: true,
      lastChangedAt: x * 100 + y
    }));

    const updates = buildForcedRevealTileUpdates(["12,4", "12,4", "13,4"], { parseKey, playerTile });

    expect(playerTile).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([
      { x: 12, y: 4, terrain: "LAND", fogged: false, lastChangedAt: 1204 },
      { x: 13, y: 4, terrain: "LAND", fogged: false, lastChangedAt: 1304 }
    ]);
  });

  it("pushes a bulk tile delta when newly revealed tiles exist", () => {
    const playerTile = vi.fn((x: number, y: number): Tile => ({
      x,
      y,
      terrain: x === 8 ? "LAND" : "SEA",
      fogged: true,
      lastChangedAt: x * 100 + y
    }));
    const sendBulkToPlayer = vi.fn();

    const updates = syncForcedRevealTileUpdatesForPlayer("player-1", ["8,9", "9,9"], {
      parseKey,
      playerTile,
      sendBulkToPlayer
    });

    expect(sendBulkToPlayer).toHaveBeenCalledTimes(1);
    expect(sendBulkToPlayer).toHaveBeenCalledWith("player-1", {
      type: "TILE_DELTA",
      updates
    });
    expect(updates).toEqual([
      { x: 8, y: 9, terrain: "LAND", fogged: false, lastChangedAt: 809 },
      { x: 9, y: 9, terrain: "SEA", fogged: false, lastChangedAt: 909 }
    ]);
  });

  it("skips the bulk send when there are no newly revealed tiles", () => {
    const sendBulkToPlayer = vi.fn();

    const updates = syncForcedRevealTileUpdatesForPlayer("player-1", [], {
      parseKey,
      playerTile: (x: number, y: number): Tile => ({
        x,
        y,
        terrain: "LAND",
        fogged: true,
        lastChangedAt: 0
      }),
      sendBulkToPlayer
    });

    expect(updates).toEqual([]);
    expect(sendBulkToPlayer).not.toHaveBeenCalled();
  });
});
