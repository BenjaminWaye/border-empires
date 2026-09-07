import { describe, expect, it } from "vitest";

import {
  DEADLIEST_TILE_PERSIST_LIMIT,
  seedDeadliestTiles,
  topDeadliestTiles
} from "./deadliest-tiles.js";
import { findMostDeadlyTile } from "../season-stats/season-stats.js";

describe("topDeadliestTiles", () => {
  it("returns the highest totals first, parsing coordinates out of the tile key", () => {
    const map = new Map<string, number>([
      ["10,20", 50],
      ["30,40", 900],
      ["1,2", 300]
    ]);

    expect(topDeadliestTiles(map)).toEqual([
      { x: 30, y: 40, manpowerLost: 900 },
      { x: 1, y: 2, manpowerLost: 300 },
      { x: 10, y: 20, manpowerLost: 50 }
    ]);
  });

  it("keeps only the top `limit` entries", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 500; i += 1) map.set(`${i},0`, i);

    const top = topDeadliestTiles(map, 3);

    expect(top).toEqual([
      { x: 499, y: 0, manpowerLost: 499 },
      { x: 498, y: 0, manpowerLost: 498 },
      { x: 497, y: 0, manpowerLost: 497 }
    ]);
  });

  it("defaults to DEADLIEST_TILE_PERSIST_LIMIT entries", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < DEADLIEST_TILE_PERSIST_LIMIT * 2; i += 1) map.set(`${i},0`, i + 1);

    expect(topDeadliestTiles(map)).toHaveLength(DEADLIEST_TILE_PERSIST_LIMIT);
  });

  it("skips zero/negative totals and unparseable keys", () => {
    const map = new Map<string, number>([
      ["5,5", 0],
      ["6,6", -10],
      ["not-a-key", 999],
      ["7,7", 25]
    ]);

    expect(topDeadliestTiles(map)).toEqual([{ x: 7, y: 7, manpowerLost: 25 }]);
  });

  it("returns nothing for an empty map or a non-positive limit", () => {
    expect(topDeadliestTiles(new Map())).toEqual([]);
    expect(topDeadliestTiles(new Map([["1,1", 5]]), 0)).toEqual([]);
  });
});

describe("seedDeadliestTiles", () => {
  it("restores persisted totals into a fresh runtime map", () => {
    const map = new Map<string, number>();

    seedDeadliestTiles(map, [
      { x: 30, y: 40, manpowerLost: 900 },
      { x: 1, y: 2, manpowerLost: 300 }
    ]);

    expect(map.get("30,40")).toBe(900);
    expect(map.get("1,2")).toBe(300);
  });

  it("is idempotent — re-seeding does not double-count", () => {
    const map = new Map<string, number>();
    const entries = [{ x: 3, y: 4, manpowerLost: 120 }];

    seedDeadliestTiles(map, entries);
    seedDeadliestTiles(map, entries);

    expect(map.get("3,4")).toBe(120);
  });

  it("never walks a larger live total backwards", () => {
    const map = new Map<string, number>([["3,4", 500]]);

    seedDeadliestTiles(map, [{ x: 3, y: 4, manpowerLost: 120 }]);

    expect(map.get("3,4")).toBe(500);
  });

  it("tolerates undefined and malformed entries", () => {
    const map = new Map<string, number>();

    seedDeadliestTiles(map, undefined);
    seedDeadliestTiles(map, [
      { x: Number.NaN, y: 1, manpowerLost: 10 },
      { x: 1, y: 1, manpowerLost: Number.NaN },
      { x: 2, y: 2, manpowerLost: 0 }
    ]);

    expect(map.size).toBe(0);
  });

  // The whole point of the round trip: what a restart restores must still
  // produce the same season stat the pre-restart process would have reported.
  it("survives a persist/restore round trip with the season stat intact", () => {
    const beforeRestart = new Map<string, number>([
      ["10,20", 50],
      ["30,40", 900],
      ["1,2", 300]
    ]);

    const persisted = topDeadliestTiles(beforeRestart);
    const afterRestart = new Map<string, number>();
    seedDeadliestTiles(afterRestart, persisted);

    expect(findMostDeadlyTile(afterRestart)).toEqual(findMostDeadlyTile(beforeRestart));
    expect(findMostDeadlyTile(afterRestart)).toEqual({ x: 30, y: 40, manpowerLost: 900 });
  });
});
