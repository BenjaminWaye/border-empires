import { describe, expect, it } from "vitest";
import { isEnclosedBy } from "./enclosure.js";
import type { EnclosureLookup, EnclosureTileFacts } from "./enclosure.js";

const WIDTH = 100;
const HEIGHT = 100;

/**
 * Build a simple lookup from a record of "x,y" → facts.
 * Tiles not in the map are unowned LAND by default.
 */
const makeLookup = (
  tiles: Record<string, EnclosureTileFacts>,
  defaultTerrain = "LAND"
): EnclosureLookup =>
  (x, y) => tiles[`${x},${y}`] ?? { terrain: defaultTerrain, ownerId: undefined };

describe("isEnclosedBy", () => {
  it("returns true for a 3×3 interior tile surrounded by player tiles", () => {
    // Build a ring of player P's tiles around (5,5)
    // P owns: (4,5), (6,5), (5,4), (5,6) — the 4 cardinal neighbours.
    // Also add corners so the BFS from (5,5) is fully blocked.
    // (5,5) is unowned LAND.
    const tiles: Record<string, EnclosureTileFacts> = {
      // Left, right, up, down
      "4,5": { terrain: "LAND", ownerId: "P" },
      "6,5": { terrain: "LAND", ownerId: "P" },
      "5,4": { terrain: "LAND", ownerId: "P" },
      "5,6": { terrain: "LAND", ownerId: "P" },
      // (5,5) itself is unowned
      "5,5": { terrain: "LAND", ownerId: undefined }
    };
    // All other tiles default to unowned LAND — so we need a fully enclosing ring.
    // Let's build a proper 5×5 ring:
    const ringTiles: Record<string, EnclosureTileFacts> = {};
    // Outer ring at distance 2 from center (3,3) to (7,7) — all owned by P
    for (let x = 2; x <= 8; x++) {
      ringTiles[`${x},2`] = { terrain: "LAND", ownerId: "P" };
      ringTiles[`${x},8`] = { terrain: "LAND", ownerId: "P" };
    }
    for (let y = 3; y <= 7; y++) {
      ringTiles[`2,${y}`] = { terrain: "LAND", ownerId: "P" };
      ringTiles[`8,${y}`] = { terrain: "LAND", ownerId: "P" };
    }
    // Interior (5,5) unowned LAND
    ringTiles["5,5"] = { terrain: "LAND", ownerId: undefined };

    const lookup = makeLookup(ringTiles);
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(true);
  });

  it("returns false for a tile that can reach open land (no ring)", () => {
    // (5,5) surrounded by other unowned tiles — no enclosure
    const tiles: Record<string, EnclosureTileFacts> = {
      "5,5": { terrain: "LAND", ownerId: undefined }
    };
    const lookup = makeLookup(tiles);
    // BFS from (5,5) will immediately reach neighbours that are also unowned LAND,
    // and eventually hit more than 500 tiles → returns false (cap exceeded / open)
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(false);
  });

  it("returns false when a tile touches enemy-owned territory", () => {
    // Build a ring but with one gap replaced by an enemy tile
    const ringTiles: Record<string, EnclosureTileFacts> = {};
    for (let x = 2; x <= 8; x++) {
      ringTiles[`${x},2`] = { terrain: "LAND", ownerId: "P" };
      ringTiles[`${x},8`] = { terrain: "LAND", ownerId: "P" };
    }
    for (let y = 3; y <= 7; y++) {
      ringTiles[`2,${y}`] = { terrain: "LAND", ownerId: "P" };
      ringTiles[`8,${y}`] = { terrain: "LAND", ownerId: "P" };
    }
    // Place an enemy inside the ring
    ringTiles["5,5"] = { terrain: "LAND", ownerId: "Enemy" };

    const lookup = makeLookup(ringTiles);
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(false);
  });

  it("returns false when the pocket reaches enemy territory through a gap", () => {
    // Ring with a gap on the right side — pocket leaks out to open land
    const ringTiles: Record<string, EnclosureTileFacts> = {};
    for (let x = 2; x <= 8; x++) {
      ringTiles[`${x},2`] = { terrain: "LAND", ownerId: "P" };
      ringTiles[`${x},8`] = { terrain: "LAND", ownerId: "P" };
    }
    for (let y = 3; y <= 7; y++) {
      ringTiles[`2,${y}`] = { terrain: "LAND", ownerId: "P" };
      // Intentional gap at x=8 for y=5 — BFS can escape right
    }
    for (let y = 3; y <= 7; y++) {
      if (y !== 5) ringTiles[`8,${y}`] = { terrain: "LAND", ownerId: "P" };
    }
    ringTiles["5,5"] = { terrain: "LAND", ownerId: undefined };

    const lookup = makeLookup(ringTiles);
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(false);
  });

  it("handles sea as a natural barrier (enclosed by sea + player)", () => {
    // (5,5) surrounded on all sides by sea or player tiles
    const lookup = makeLookup({
      "5,5": { terrain: "LAND", ownerId: undefined },
      "5,4": { terrain: "SEA", ownerId: undefined },
      "5,6": { terrain: "SEA", ownerId: undefined },
      "4,5": { terrain: "LAND", ownerId: "P" },
      "6,5": { terrain: "LAND", ownerId: "P" }
    });
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(true);
  });

  it("handles mountain as a natural barrier", () => {
    const lookup = makeLookup({
      "5,5": { terrain: "LAND", ownerId: undefined },
      "5,4": { terrain: "MOUNTAIN", ownerId: undefined },
      "5,6": { terrain: "MOUNTAIN", ownerId: undefined },
      "4,5": { terrain: "LAND", ownerId: "P" },
      "6,5": { terrain: "LAND", ownerId: "P" }
    });
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(true);
  });

  it("returns false for a 600-tile open region (cap exceeded)", () => {
    // All tiles unowned LAND — BFS will exceed 500 tiles
    const lookup = makeLookup({});
    expect(isEnclosedBy(50, 50, "P", lookup, WIDTH, HEIGHT)).toBe(false);
  });

  it("returns true for a tile that is itself owned by the enclosing player", () => {
    const lookup = makeLookup({
      "5,5": { terrain: "LAND", ownerId: "P" }
    });
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(true);
  });

  it("returns true for a barrier tile (sea)", () => {
    const lookup = makeLookup({
      "5,5": { terrain: "SEA", ownerId: undefined }
    });
    expect(isEnclosedBy(5, 5, "P", lookup, WIDTH, HEIGHT)).toBe(true);
  });

  it("wraps around map edges correctly", () => {
    // Tile at (0,0) — surrounded by P on the wrapped edges
    // Width=10, Height=10: (0,0) neighbours are (9,0),(1,0),(0,9),(0,1)
    const W = 10;
    const H = 10;
    const lookup = makeLookup({
      "0,0": { terrain: "LAND", ownerId: undefined },
      // All 4 wrapped neighbours are owned by P
      "9,0": { terrain: "LAND", ownerId: "P" },
      "1,0": { terrain: "LAND", ownerId: "P" },
      "0,9": { terrain: "LAND", ownerId: "P" },
      "0,1": { terrain: "LAND", ownerId: "P" }
    });
    expect(isEnclosedBy(0, 0, "P", lookup, W, H)).toBe(true);
  });
});
