import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeOtherOwnersReachPylons } from "./client-reach-overlay-3d-multi.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => v;
const deps = { tiles: new Map<string, Tile>(), keyFor, wrapX: wrap, wrapY: wrap };

// Land tiles at the reach keys so filterReachToLand doesn't drop them.
const landTilesAt = (keys: readonly string[]): Map<string, Tile> =>
  new Map(
    keys.map((key) => {
      const [x, y] = key.split(",").map(Number);
      return [key, { x, y, terrain: "LAND" } as unknown as Tile];
    })
  );

describe("computeOtherOwnersReachPylons — server data vs. local guess", () => {
  it("traces an owner from server data even when nothing in `tiles` suggests they have an anchor there", () => {
    // No owned tiles in `tiles` at all for "rival" -- the local guess
    // (computeReachSetsByOwner) would find nothing. Server data must still
    // produce a shape, since it's authoritative and fog-clipped, not derived
    // from locally-cached anchor tiles.
    const serverRivalReach = new Map([["rival", new Set(["5,5", "5,6", "6,5", "6,6"])]]);
    const tiles = landTilesAt(["5,5", "5,6", "6,5", "6,6"]);

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor, serverRivalReach);

    expect(pylons.some((p) => p.ownerId === "rival")).toBe(true);
  });

  it("never merges server data with the local guess for the same owner — server data wins outright", () => {
    // The local guess would derive a totally different (larger, unclipped)
    // shape from this anchor tile; the server's clipped set must be used
    // exclusively, not unioned with it.
    const anchorTile = { x: 50, y: 50, terrain: "LAND", ownerId: "rival", dockId: "dock-1" } as unknown as Tile;
    const tiles = new Map<string, Tile>([[keyFor(50, 50), anchorTile], ...landTilesAt(["1,1"])]);
    const serverRivalReach = new Map([["rival", new Set(["1,1"])]]);

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor, serverRivalReach);

    // Only the server-clipped tile's neighborhood should ever be traced for
    // "rival" -- nothing from the local guess around (50,50).
    expect(pylons.every((p) => p.ownerId !== "rival" || (Math.abs(p.x - 1) <= 1 && Math.abs(p.y - 1) <= 1))).toBe(true);
  });

  it("falls back to the local guess for an owner the server hasn't sent anything for yet", () => {
    const anchorTile = { x: 5, y: 5, terrain: "LAND", ownerId: "rival", dockId: "dock-1" } as unknown as Tile;
    const tiles = new Map<string, Tile>([[keyFor(5, 5), anchorTile]]);
    const serverRivalReach = new Map<string, Set<string>>(); // nothing pushed yet

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor, serverRivalReach);

    expect(pylons.some((p) => p.ownerId === "rival")).toBe(true);
  });

  it("never includes the caller's own id, even if present in server data", () => {
    const serverRivalReach = new Map([["me", new Set(["1,1"])]]);
    const tiles = landTilesAt(["1,1"]);

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor, serverRivalReach);

    expect(pylons.every((p) => p.ownerId !== "me")).toBe(true);
  });
});
