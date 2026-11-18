import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeFortPerimeterCoverage, fortPerimeterWallEdges } from "./client-fort-perimeter.js";

const NOW = 1_000;
const tile = (x: number, y: number, extra: Partial<Tile> = {}): Tile =>
  ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra }) as Tile;
const fortTile = (x: number, y: number, variant: "FORT" | "TITANIUM_BASTION" = "FORT", extra: Partial<Tile> = {}): Tile =>
  tile(x, y, { fort: { ownerId: "me", status: "active", variant }, ...extra });
const tilesOf = (...tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("computeFortPerimeterCoverage", () => {
  it("covers the fort and its owner's garrisoned tiles within radius, not frontier or rival land", () => {
    const coverage = computeFortPerimeterCoverage(
      tilesOf(fortTile(10, 10), tile(11, 10), tile(9, 9, { ownershipState: "FRONTIER" }), tile(10, 11, { ownerId: "rival" }), tile(12, 10)),
      NOW
    );
    expect([...coverage.keys()].sort()).toEqual(["10,10", "11,10"]);
  });

  it("reaches radius 2 for a Bastion", () => {
    expect(computeFortPerimeterCoverage(tilesOf(fortTile(10, 10, "TITANIUM_BASTION"), tile(12, 12)), NOW).has("12,12")).toBe(true);
  });

  it("ignores forts still under construction, disabled or seen only through fog", () => {
    expect(computeFortPerimeterCoverage(tilesOf(tile(10, 10, { fort: { ownerId: "me", status: "under_construction", variant: "FORT" } }), tile(11, 10)), NOW).size).toBe(0);
    expect(computeFortPerimeterCoverage(tilesOf(fortTile(10, 10, "FORT", { fort: { ownerId: "me", status: "active", variant: "FORT", disabledUntil: NOW + 1 } } as Partial<Tile>)), NOW).size).toBe(0);
    expect(computeFortPerimeterCoverage(tilesOf(fortTile(10, 10, "FORT", { fogged: true })), NOW).size).toBe(0);
  });
});

describe("fortPerimeterWallEdges", () => {
  it("walls only the outer sides of the covered area", () => {
    const coverage = computeFortPerimeterCoverage(tilesOf(fortTile(10, 10), tile(11, 10)), NOW);
    expect(fortPerimeterWallEdges({ x: 10, y: 10 }, coverage)).toEqual({ north: true, east: false, south: true, west: true, variant: "FORT" });
    expect(fortPerimeterWallEdges({ x: 11, y: 10 }, coverage)).toEqual({ north: true, east: true, south: true, west: false, variant: "FORT" });
    expect(fortPerimeterWallEdges({ x: 12, y: 10 }, coverage)).toBeUndefined();
  });

  it("returns nothing for a fully enclosed interior tile", () => {
    const around = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => tile(10 + dx, 10 + dy)));
    const coverage = computeFortPerimeterCoverage(tilesOf(...around, fortTile(10, 10)), NOW);
    expect(fortPerimeterWallEdges({ x: 10, y: 10 }, coverage)).toBeUndefined();
  });

  it("styles a shared wall by the strongest tier covering each tile", () => {
    const tiles = tilesOf(tile(10, 10, { fort: { ownerId: "me", status: "active", variant: "PALISADE" } }), tile(11, 10), fortTile(13, 10, "TITANIUM_BASTION"));
    const coverage = computeFortPerimeterCoverage(tiles, NOW);
    expect(coverage.get("10,10")?.variant).toBe("PALISADE");
    expect(coverage.get("11,10")?.variant).toBe("TITANIUM_BASTION");
    expect(fortPerimeterWallEdges({ x: 11, y: 10 }, coverage)?.variant).toBe("TITANIUM_BASTION");
  });

  it("draws no wall around the player's own dormant fort", () => {
    const tiles = tilesOf(fortTile(10, 10), tile(11, 10));
    expect(computeFortPerimeterCoverage(tiles, NOW, new Set(["10,10:fort"])).size).toBe(0);
    expect(computeFortPerimeterCoverage(tiles, NOW, new Set(["10,10:observatory"])).size).toBe(2);
  });
});
