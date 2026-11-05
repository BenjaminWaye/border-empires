import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTLED_EDGE_GLOW,
  EDGE_E,
  EDGE_N,
  EDGE_NW,
  EDGE_W,
  settledEdgeAlpha,
  settledEdgeDistance,
  settledEdgeMaskForOwner
} from "./client-settled-edge-glow.js";

type T = { ownerId: string; ownershipState: "SETTLED" | "FRONTIER" };
const deps = (tiles: Record<string, T>) => ({
  tiles: new Map(Object.entries(tiles)),
  keyFor: (x: number, y: number) => `${x},${y}`,
  wrapX: (x: number) => ((x % 10) + 10) % 10,
  wrapY: (y: number) => y
});
const settledBlock = (ownerId: string): Record<string, T> => {
  const tiles: Record<string, T> = {};
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) tiles[`${x},${y}`] = { ownerId, ownershipState: "SETTLED" };
  return tiles;
};

describe("settledEdgeMaskForOwner", () => {
  it("flags nothing for a tile ringed by its owner's settled land", () => {
    expect(settledEdgeMaskForOwner(1, 1, "a", deps(settledBlock("a")))).toBe(0);
  });

  it("treats the owner's own frontier, rival land and unowned land as boundary", () => {
    const tiles = settledBlock("a");
    tiles["1,0"] = { ownerId: "a", ownershipState: "FRONTIER" };
    tiles["2,1"] = { ownerId: "b", ownershipState: "SETTLED" };
    delete tiles["0,0"];
    expect(settledEdgeMaskForOwner(1, 1, "a", deps(tiles))).toBe(EDGE_N | EDGE_E | EDGE_NW);
  });

  it("wraps neighbour lookups across the world seam", () => {
    const tiles: Record<string, T> = { "9,0": { ownerId: "a", ownershipState: "SETTLED" } };
    // Tile (0,0)'s west neighbour is (9,0) after wrapping.
    expect(settledEdgeMaskForOwner(0, 0, "a", deps(tiles)) & EDGE_W).toBe(0);
  });
});

describe("settledEdgeDistance / settledEdgeAlpha", () => {
  it("is rim-strength on a flagged edge and interior-strength a full tile away", () => {
    expect(settledEdgeAlpha(settledEdgeDistance(0, 0.5, EDGE_W), DEFAULT_SETTLED_EDGE_GLOW)).toBeCloseTo(DEFAULT_SETTLED_EDGE_GLOW.rimOpacity);
    expect(settledEdgeAlpha(settledEdgeDistance(1, 0.5, EDGE_W), DEFAULT_SETTLED_EDGE_GLOW)).toBeCloseTo(DEFAULT_SETTLED_EDGE_GLOW.interiorOpacity);
    expect(settledEdgeAlpha(settledEdgeDistance(0.5, 0.5, 0), DEFAULT_SETTLED_EDGE_GLOW)).toBeCloseTo(DEFAULT_SETTLED_EDGE_GLOW.interiorOpacity);
  });

  it("matches across the seam between a rim tile and its unflagged interior neighbour", () => {
    // West-edge tile at its east side vs. the interior tile east of it at its west side.
    const rimSide = settledEdgeAlpha(settledEdgeDistance(1, 0.3, EDGE_W), DEFAULT_SETTLED_EDGE_GLOW);
    const interiorSide = settledEdgeAlpha(settledEdgeDistance(0, 0.3, 0), DEFAULT_SETTLED_EDGE_GLOW);
    expect(rimSide).toBeCloseTo(interiorSide);
  });

  it("rounds a diagonal-only corner instead of notching it", () => {
    expect(settledEdgeDistance(0, 0, EDGE_NW)).toBe(0);
    expect(settledEdgeDistance(0.3, 0.4, EDGE_NW)).toBeCloseTo(0.5);
  });
});

describe("settledEdgeMaskForOwner with isLandAt", () => {
  it("treats non-land neighbours as inside, so coasts get no rim", () => {
    const tiles: Record<string, T> = settledBlock("a");
    delete tiles["2,1"];
    const withWater = { ...deps(tiles), isLandAt: (x: number, y: number) => !(x === 2 && y === 1) };
    expect(settledEdgeMaskForOwner(1, 1, "a", withWater)).toBe(0);
    expect(settledEdgeMaskForOwner(1, 1, "a", deps(tiles))).toBe(EDGE_E);
  });
});
