import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeReachSetsByOwnerFromWire } from "./client-reach-overlay-all-owners.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("computeReachSetsByOwnerFromWire", () => {
  it("computes a reach set per distinct owner from reachOwnerId, matching what the border pylon overlay could never show before (only \"me\")", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", reachOwnerId: "me" } as unknown as Tile],
      [keyFor(50, 50), { x: 50, y: 50, terrain: "LAND", reachOwnerId: "ai-1" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwnerFromWire(tiles);
    expect(byOwner.get("me")?.has(keyFor(5, 5))).toBe(true);
    expect(byOwner.get("me")?.has(keyFor(50, 50))).toBe(false);
    expect(byOwner.get("ai-1")?.has(keyFor(50, 50))).toBe(true);
    expect(byOwner.get("ai-1")?.has(keyFor(5, 5))).toBe(false);
  });

  it("excludes the caller's own id when excludeOwnerId is passed (the 3D renderer already has its own copy of that shape)", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", reachOwnerId: "me" } as unknown as Tile],
      [keyFor(50, 50), { x: 50, y: 50, terrain: "LAND", reachOwnerId: "ai-1" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwnerFromWire(tiles, "me");
    expect(byOwner.has("me")).toBe(false);
    expect(byOwner.has("ai-1")).toBe(true);
  });

  it("excludes barbarian territory -- environment, not a bordered empire, same as the server-side design", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", reachOwnerId: "barbarian-1" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwnerFromWire(tiles);
    expect(byOwner.size).toBe(0);
  });

  it("returns an empty map when no tile carries a reachOwnerId at all", () => {
    const tiles = new Map<string, Tile>([[keyFor(5, 5), { x: 5, y: 5, terrain: "LAND" } as unknown as Tile]]);
    expect(computeReachSetsByOwnerFromWire(tiles).size).toBe(0);
  });

  it("groups two owners' tiles into distinct, non-overlapping sets even when adjacent -- the server already resolved the contest, one owner per tile", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(1, 1), { x: 1, y: 1, terrain: "LAND", reachOwnerId: "rivalA" } as unknown as Tile],
      [keyFor(2, 1), { x: 2, y: 1, terrain: "LAND", reachOwnerId: "rivalB" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwnerFromWire(tiles);
    expect(byOwner.get("rivalA")?.has(keyFor(2, 1))).toBe(false);
    expect(byOwner.get("rivalB")?.has(keyFor(1, 1))).toBe(false);
  });
});
