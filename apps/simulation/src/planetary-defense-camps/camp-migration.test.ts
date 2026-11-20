import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { migrateLegacyPlanetaryDefenseTiles } from "./camp-migration.js";

const key = (x: number, y: number) => `${x},${y}`;
const oldBarb = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", ...extra
});
const world = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((tile) => [key(tile.x, tile.y), tile]));
const town = { type: "FARMING" as const, populationTier: "TOWN" as const };

describe("migrateLegacyPlanetaryDefenseTiles", () => {
  it("turns a cluster without towns into one camp (lowest y, then x) and frontier", () => {
    const tiles = world([oldBarb(11, 10), oldBarb(10, 10), oldBarb(10, 11)]);
    expect(migrateLegacyPlanetaryDefenseTiles(tiles)).toEqual({ camps: 1, frontier: 2, released: 0 });
    expect(tiles.get("10,10")).toMatchObject({ ownershipState: "SETTLED", campId: "10,10" });
    expect(tiles.get("11,10")).toMatchObject({ ownershipState: "FRONTIER", campId: "10,10" });
    expect(tiles.get("10,11")).toMatchObject({ ownershipState: "FRONTIER", campId: "10,10" });
  });

  it("every town or dock in a cluster becomes a camp; the rest joins the nearest", () => {
    const tiles = world([oldBarb(10, 10, { town }), oldBarb(11, 10), oldBarb(12, 10), oldBarb(13, 10), oldBarb(14, 10, { dockId: "d" })]);
    expect(migrateLegacyPlanetaryDefenseTiles(tiles)).toEqual({ camps: 2, frontier: 3, released: 0 });
    expect(tiles.get("11,10")?.campId).toBe("10,10");
    expect(tiles.get("13,10")?.campId).toBe("14,10");
    expect(tiles.get("14,10")).toMatchObject({ ownershipState: "SETTLED", campId: "14,10" });
  });

  it("separate clusters become separate camps, and converted worlds are left alone", () => {
    const tiles = world([oldBarb(10, 10), oldBarb(40, 40)]);
    expect(migrateLegacyPlanetaryDefenseTiles(tiles)).toEqual({ camps: 2, frontier: 0, released: 0 });
    const before = new Map(tiles);
    expect(migrateLegacyPlanetaryDefenseTiles(tiles)).toEqual({ camps: 0, frontier: 0, released: 0 });
    expect(tiles).toEqual(before);
  });

  it("is deterministic in the tile state, whatever the map's insertion order", () => {
    const seeds = [oldBarb(12, 10), oldBarb(10, 10, { town }), oldBarb(11, 10), oldBarb(13, 10, { town })];
    const a = world(seeds);
    const b = world([...seeds].reverse());
    migrateLegacyPlanetaryDefenseTiles(a);
    migrateLegacyPlanetaryDefenseTiles(b);
    expect(new Map([...a].sort())).toEqual(new Map([...b].sort()));
  });
});
