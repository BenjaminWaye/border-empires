import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeOtherOwnersReachPylons } from "./client-reach-overlay-3d-multi.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => v;
const deps = { tiles: new Map<string, Tile>(), keyFor, wrapX: wrap, wrapY: wrap };

// Land tiles at the given keys, each stamped with reachOwnerId so
// filterReachToLand doesn't drop them and computeReachSetsByOwnerFromWire
// picks them up.
const landTilesAt = (keys: readonly string[], reachOwnerId: string): Map<string, Tile> =>
  new Map(
    keys.map((key) => {
      const [x, y] = key.split(",").map(Number);
      return [key, { x, y, terrain: "LAND", reachOwnerId } as unknown as Tile];
    })
  );

describe("computeOtherOwnersReachPylons — reads reachOwnerId directly", () => {
  it("traces an owner purely from tile.reachOwnerId, regardless of whether they have an anchor tile in view", () => {
    // No town/dock/outpost anchor for "rival" anywhere in `tiles` -- the old
    // anchor-disk guess would find nothing. reachOwnerId alone must still
    // produce a shape, since it's the server's authoritative, already
    // contest-resolved border.
    const tiles = landTilesAt(["5,5", "5,6", "6,5", "6,6"], "rival");

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor);

    expect(pylons.some((p) => p.ownerId === "rival")).toBe(true);
  });

  it("traces each of two adjacent owners from their own exclusive tile set, never from a shared/overlapping one", () => {
    // Two owners' tiles sit right next to each other. Since each tile's
    // reachOwnerId names exactly one owner (never both), the input reach set
    // handed to the boundary tracer for each owner is disjoint from the
    // other's -- the original bug this whole mechanism replaced was two
    // independently-guessed, unclipped disks visually overlapping right at
    // a contact line like this one, because the guess had no such exclusivity.
    const tiles = new Map<string, Tile>([...landTilesAt(["1,1", "1,2"], "rivalA"), ...landTilesAt(["2,1", "2,2"], "rivalB")]);

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor);

    expect(pylons.some((p) => p.ownerId === "rivalA")).toBe(true);
    expect(pylons.some((p) => p.ownerId === "rivalB")).toBe(true);
  });

  it("never includes the caller's own id, even if reachOwnerId matches it", () => {
    const tiles = landTilesAt(["1,1"], "me");

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor);

    expect(pylons.every((p) => p.ownerId !== "me")).toBe(true);
  });

  it("excludes barbarian territory — barbarians are environment, not a bordered empire", () => {
    const tiles = landTilesAt(["1,1"], "barbarian-north");

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor);

    expect(pylons.every((p) => p.ownerId !== "barbarian-north")).toBe(true);
  });

  it("produces nothing for a tile the client hasn't loaded, same limitation the old guess had", () => {
    const tiles = new Map<string, Tile>();

    const { pylons } = computeOtherOwnersReachPylons(tiles, "me", { ...deps, tiles }, keyFor);

    expect(pylons).toHaveLength(0);
  });
});
