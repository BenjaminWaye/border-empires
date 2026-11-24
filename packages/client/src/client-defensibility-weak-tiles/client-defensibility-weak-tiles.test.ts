import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { weakDefensibilityEntries } from "./client-defensibility-weak-tiles.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const argsFor = (tileList: Tile[], from?: { x: number; y: number }) => {
  const tiles = new Map(tileList.map((tile) => [keyFor(tile.x, tile.y), tile]));
  return {
    tiles,
    me: "me",
    keyFor,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    terrainAt: (x: number, y: number) => tiles.get(keyFor(x, y))?.terrain ?? "LAND",
    ...(from ? { from } : {})
  };
};

const settled = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });

describe("weakDefensibilityEntries", () => {
  it("ranks the weakest tile first and explains each open side by what lies beyond it", () => {
    const entries = weakDefensibilityEntries(
      argsFor([
        settled(10, 10),
        settled(11, 10),
        settled(12, 10),
        { x: 12, y: 9, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" },
        { x: 13, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" },
        { x: 12, y: 11, terrain: "LAND" }
      ])
    );
    expect(entries[0]).toMatchObject({ x: 10, y: 10, severity: "critical" });
    const spur = entries.find((entry) => entry.x === 12);
    expect(spur?.reason).toBe("2 open sides: north (rival land) and south (unclaimed land)");
  });

  it("breaks ties by distance from the camera", () => {
    const entries = weakDefensibilityEntries(argsFor([settled(0, 0), settled(50, 50)], { x: 48, y: 48 }));
    expect(entries.map((entry) => [entry.x, entry.y])).toEqual([
      [50, 50],
      [0, 0]
    ]);
  });

  it("skips tiles with fewer than 2 open sides", () => {
    const water = (x: number, y: number): Tile => ({ x, y, terrain: "SEA" });
    expect(weakDefensibilityEntries(argsFor([settled(5, 5), water(5, 4), water(4, 5), water(6, 5)]))).toEqual([]);
  });
});
