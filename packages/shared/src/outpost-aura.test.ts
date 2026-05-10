import { describe, expect, it } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { type OutpostAuraTileFacts, scanOutpostMult, tileOutpostMult } from "./outpost-aura.js";

describe("tileOutpostMult", () => {
  it("returns 1 when the tile is not owned by the player", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "other",
      siegeOutpost: { ownerId: "other", status: "active" }
    };
    expect(tileOutpostMult(tile, "player-1")).toEqual({ mult: 1, siege: false });
  });

  it("returns the Siege multiplier when an active siege outpost is present", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "player-1",
      siegeOutpost: { ownerId: "player-1", status: "active" }
    };
    expect(tileOutpostMult(tile, "player-1")).toEqual({ mult: 1.6, siege: true });
  });

  it("returns the Light multiplier for active Light Outpost economic structures", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "player-1",
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" }
    };
    expect(tileOutpostMult(tile, "player-1")).toEqual({ mult: 1.25, siege: false });
  });

  it("ignores constructing outposts", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "player-1",
      siegeOutpost: { ownerId: "player-1", status: "constructing" },
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "constructing" }
    };
    expect(tileOutpostMult(tile, "player-1")).toEqual({ mult: 1, siege: false });
  });

  it("ignores non-LIGHT_OUTPOST economic structures", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "player-1",
      economicStructure: { ownerId: "player-1", type: "MILL", status: "active" }
    };
    expect(tileOutpostMult(tile, "player-1")).toEqual({ mult: 1, siege: false });
  });
});

describe("scanOutpostMult", () => {
  const tilesByKey = new Map<string, OutpostAuraTileFacts>();
  const seed = (x: number, y: number, tile: OutpostAuraTileFacts) => {
    tilesByKey.set(`${x},${y}`, tile);
  };
  const lookup = (x: number, y: number) => tilesByKey.get(`${x},${y}`);

  it("picks up an active Light Outpost within Chebyshev reach=2 and ignores it at distance 3", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "player-1",
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" }
    });

    expect(scanOutpostMult("player-1", 10, 10, lookup)).toBeCloseTo(1.25, 6);
    expect(scanOutpostMult("player-1", 12, 12, lookup)).toBeCloseTo(1.25, 6);
    expect(scanOutpostMult("player-1", 13, 10, lookup)).toBe(1);
    expect(scanOutpostMult("player-1", 10, 13, lookup)).toBe(1);
  });

  it("Siege outpost overrides any Light Outposts in range", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "player-1",
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" }
    });
    seed(11, 10, {
      ownerId: "player-1",
      siegeOutpost: { ownerId: "player-1", status: "active" }
    });

    expect(scanOutpostMult("player-1", 10, 10, lookup)).toBeCloseTo(1.6, 6);
  });

  it("ignores enemy-owned outposts", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "player-2",
      economicStructure: { ownerId: "player-2", type: "LIGHT_OUTPOST", status: "active" }
    });
    expect(scanOutpostMult("player-1", 10, 10, lookup)).toBe(1);
  });

  it("wraps around world edges", () => {
    tilesByKey.clear();
    seed(0, 0, {
      ownerId: "player-1",
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" }
    });

    expect(scanOutpostMult("player-1", WORLD_WIDTH - 1, WORLD_HEIGHT - 1, lookup)).toBeCloseTo(1.25, 6);
    expect(scanOutpostMult("player-1", 1, WORLD_HEIGHT - 1, lookup)).toBeCloseTo(1.25, 6);
    expect(scanOutpostMult("player-1", 3, 0, lookup)).toBe(1);
  });
});
