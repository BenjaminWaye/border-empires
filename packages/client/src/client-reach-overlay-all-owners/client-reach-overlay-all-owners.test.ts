import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeReachSetsByOwner } from "./client-reach-overlay-all-owners.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("computeReachSetsByOwner", () => {
  it("computes a reach set per distinct owner, matching what the border pylon overlay could never show before (only \"me\")", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", dockId: "dock-1" } as unknown as Tile],
      [keyFor(50, 50), { x: 50, y: 50, terrain: "LAND", ownerId: "ai-1", dockId: "dock-2" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwner(tiles);
    expect(byOwner.has("me")).toBe(true);
    expect(byOwner.has("ai-1")).toBe(true);
    // DOCK_REACH_RADIUS = 1 -- each owner's dock covers only its own tile + neighbours.
    expect(byOwner.get("me")?.has(keyFor(5, 5))).toBe(true);
    expect(byOwner.get("me")?.has(keyFor(50, 50))).toBe(false);
    expect(byOwner.get("ai-1")?.has(keyFor(50, 50))).toBe(true);
    expect(byOwner.get("ai-1")?.has(keyFor(5, 5))).toBe(false);
  });

  it("excludes the caller's own id when excludeOwnerId is passed (the 3D renderer already has its own copy of that shape)", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", dockId: "dock-1" } as unknown as Tile],
      [keyFor(50, 50), { x: 50, y: 50, terrain: "LAND", ownerId: "ai-1", dockId: "dock-2" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwner(tiles, "me");
    expect(byOwner.has("me")).toBe(false);
    expect(byOwner.has("ai-1")).toBe(true);
  });

  it("excludes barbarian territory -- environment, not a bordered empire, same as the server-side design", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "barbarian-1", dockId: "dock-1" } as unknown as Tile]
    ]);
    const byOwner = computeReachSetsByOwner(tiles);
    expect(byOwner.size).toBe(0);
  });

  it("returns an empty map when no owned anchor tiles are visible at all", () => {
    const tiles = new Map<string, Tile>([[keyFor(5, 5), { x: 5, y: 5, terrain: "LAND" } as unknown as Tile]]);
    expect(computeReachSetsByOwner(tiles).size).toBe(0);
  });
});
