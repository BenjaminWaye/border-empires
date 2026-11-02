import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { scanGuideTiles } from "./tutorial-guide-input.js";

const ME = "p1";
const map = (tiles: Array<Partial<Tile> & { x: number; y: number }>): ReadonlyMap<string, Tile> =>
  new Map(tiles.map((t) => [tileKey(t.x, t.y), { terrain: "LAND", ...t } as Tile]));

describe("scanGuideTiles", () => {
  it("does not count a Relay Beacon as the first building (it needs no Manifest), but counts any other structure", () => {
    const beaconOnly = map([{ x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "RELAY_BEACON" } as never }]);
    expect(scanGuideTiles(beaconOnly, ME, undefined).ownsBuiltStructure).toBe(false);
    const garden = map([{ x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "HYDROGARDEN" } as never }]);
    expect(scanGuideTiles(garden, ME, undefined).ownsBuiltStructure).toBe(true);
  });

  it("targets the player's own empty garrisoned resource tiles for building, nearest home first", () => {
    const tiles = map([
      { x: 9, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FARM" },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" },
      { x: 2, y: 0, ownerId: ME, ownershipState: "FRONTIER", resource: "FARM" },
      { x: 3, y: 0, resource: "FARM" }
    ]);
    expect(scanGuideTiles(tiles, ME, { x: 0, y: 0 }).buildTargetTiles).toEqual([
      { x: 1, y: 0 },
      { x: 9, y: 0 }
    ]);
  });

  it("targets own garrisoned border tiles that touch another owner for the muster flag", () => {
    const tiles = map([
      { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED" },
      { x: 2, y: 0, ownerId: "barbarian" }
    ]);
    const scan = scanGuideTiles(tiles, ME, { x: 0, y: 0 });
    expect(scan.musterTargetTiles).toEqual([{ x: 1, y: 0 }]);
    expect(scan.ownsMusterFlag).toBe(false);
  });
});
