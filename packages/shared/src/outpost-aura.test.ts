import { describe, expect, it } from "vitest";

import {
  DREAD_TOWER_ATTACK_MULT,
  LIGHT_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_TOWER_ATTACK_MULT,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { OUTPOST_AURA_RADIUS, type OutpostAuraTileFacts, scanOutpostMult, tileOutpostMult } from "./outpost-aura.js";

describe("tileOutpostMult — per-variant multipliers", () => {
  it("VariantMult: SIEGE_OUTPOST → 1.6", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_OUTPOST" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: SIEGE_OUTPOST_ATTACK_MULT });
  });

  it("VariantMult: SIEGE_TOWER → 1.8", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_TOWER" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: SIEGE_TOWER_ATTACK_MULT });
  });

  it("VariantMult: DREAD_TOWER → 2.0", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "DREAD_TOWER" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: DREAD_TOWER_ATTACK_MULT });
  });

  it("VariantMult: LIGHT_OUTPOST → 1.25", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: LIGHT_OUTPOST_ATTACK_MULT });
  });

  it("VariantMult: undefined siege variant defaults to SIEGE_OUTPOST mult", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: SIEGE_OUTPOST_ATTACK_MULT });
  });

  it("returns 1 when the tile is not owned by the player", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "other",
      siegeOutpost: { ownerId: "other", status: "active" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: 1 });
  });

  it("ignores constructing outposts", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "under_construction" },
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "under_construction" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: 1 });
  });

  it("ignores non-LIGHT_OUTPOST economic structures", () => {
    const tile: OutpostAuraTileFacts = {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "MILL", status: "active" }
    };
    expect(tileOutpostMult(tile, "p1")).toEqual({ mult: 1 });
  });
});

describe("scanOutpostMult — target-based radius-5 aura", () => {
  const tilesByKey = new Map<string, OutpostAuraTileFacts>();
  const seed = (x: number, y: number, tile: OutpostAuraTileFacts) => {
    tilesByKey.set(`${x},${y}`, tile);
  };
  const lookup = (x: number, y: number) => tilesByKey.get(`${x},${y}`);

  it("Aura1: target within radius 5 of friendly siege outpost → bonus applied (origin irrelevant)", () => {
    tilesByKey.clear();
    // Siege outpost at (10, 10). Target at (14, 10) — exactly 4 tiles away (within radius 5).
    seed(10, 10, {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_OUTPOST" }
    });
    // Target is at (14, 10); attacker scans around target position
    expect(scanOutpostMult("p1", 14, 10, lookup)).toBeCloseTo(SIEGE_OUTPOST_ATTACK_MULT, 6);
  });

  it("Aura2: target outside any friendly aura → no bonus (mult = 1)", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_OUTPOST" }
    });
    // Target at (16, 10) — 6 tiles from outpost, outside radius 5
    expect(scanOutpostMult("p1", 16, 10, lookup)).toBe(1);
  });

  it("Aura3: target within radius 5 of friendly LIGHT_OUTPOST → 1.25 bonus", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    });
    // Target at (13, 10) — 3 tiles from outpost
    expect(scanOutpostMult("p1", 13, 10, lookup)).toBeCloseTo(LIGHT_OUTPOST_ATTACK_MULT, 6);
  });

  it("Aura4: overlapping auras of different multipliers → max wins (SIEGE_OUTPOST 1.6 beats LIGHT_OUTPOST 1.25)", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_OUTPOST" }
    });
    seed(11, 10, {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    });
    // Target at (12, 10) — within radius of both. SIEGE_OUTPOST should win.
    expect(scanOutpostMult("p1", 12, 10, lookup)).toBeCloseTo(SIEGE_OUTPOST_ATTACK_MULT, 6);
  });

  it("Aura5: enemy outpost's aura does NOT buff attacks against the enemy player's tiles", () => {
    tilesByKey.clear();
    // Player-2 has a siege outpost at (10,10)
    seed(10, 10, {
      ownerId: "p2",
      siegeOutpost: { ownerId: "p2", status: "active", variant: "SIEGE_OUTPOST" }
    });
    // Player-1 attacks a tile at (12,10) — enemy outpost should not buff p1
    expect(scanOutpostMult("p1", 12, 10, lookup)).toBe(1);
  });

  it("Aura6: aura wraps around world edges", () => {
    tilesByKey.clear();
    // Outpost near the world edge
    seed(0, 0, {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    });
    // Target at the wrapped edge: (WORLD_WIDTH - 1, WORLD_HEIGHT - 1) is distance 1,1 via wrapping
    expect(scanOutpostMult("p1", WORLD_WIDTH - 1, WORLD_HEIGHT - 1, lookup)).toBeCloseTo(LIGHT_OUTPOST_ATTACK_MULT, 6);
    // Target at (2, 0): distance 2 from outpost, within radius 5
    expect(scanOutpostMult("p1", 2, 0, lookup)).toBeCloseTo(LIGHT_OUTPOST_ATTACK_MULT, 6);
    // Target at (6, 0): distance 6 from outpost, outside radius 5
    expect(scanOutpostMult("p1", 6, 0, lookup)).toBe(1);
  });

  it("OUTPOST_AURA_RADIUS constant is 5", () => {
    expect(OUTPOST_AURA_RADIUS).toBe(5);
  });

  it("NoSweep1: non-outpost structures (MILL) do not contribute aura", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "MILL", status: "active" }
    });
    expect(scanOutpostMult("p1", 12, 10, lookup)).toBe(1);
  });

  it("DREAD_TOWER in overlapping scenario wins over SIEGE_OUTPOST and LIGHT_OUTPOST", () => {
    tilesByKey.clear();
    seed(10, 10, {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "DREAD_TOWER" }
    });
    seed(11, 10, {
      ownerId: "p1",
      siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_OUTPOST" }
    });
    seed(12, 10, {
      ownerId: "p1",
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    });
    // Target at (13, 10) is within radius of all three — DREAD_TOWER (2.0) should win
    expect(scanOutpostMult("p1", 13, 10, lookup)).toBeCloseTo(DREAD_TOWER_ATTACK_MULT, 6);
  });
});
