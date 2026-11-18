import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { isInOwnFortPerimeter, isPlainFortPerimeterTile, newlyCoveredFortPerimeterKeys } from "./fort-perimeter-auto-settle.js";

const NOW = 1_000;
const tile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", ...extra }) as DomainTileState;
const fortTile = (x: number, y: number, fort: Partial<NonNullable<DomainTileState["fort"]>>): DomainTileState =>
  tile(x, y, { ownershipState: "SETTLED", fort: { ownerId: "p1", status: "active", variant: "FORT", ...fort } as DomainTileState["fort"] });
const tilesOf = (...tiles: DomainTileState[]) => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("fort perimeter auto-garrison eligibility", () => {
  it("covers plain tiles inside the owner's perimeter only", () => {
    const tiles = tilesOf(fortTile(10, 10, {}), tile(11, 10), tile(12, 10), tile(11, 11, { resource: "FARM" } as Partial<DomainTileState>));
    expect(isPlainFortPerimeterTile(tiles, "p1", tiles.get("11,10")!, NOW)).toBe(true);
    expect(isPlainFortPerimeterTile(tiles, "p1", tiles.get("12,10")!, NOW)).toBe(false);
    // A resource tile keeps following its own auto-garrison switch.
    expect(isPlainFortPerimeterTile(tiles, "p1", tiles.get("11,11")!, NOW)).toBe(false);
    expect(isInOwnFortPerimeter(tiles, "p1", tiles.get("11,11")!, NOW)).toBe(true);
    expect(isInOwnFortPerimeter(tiles, "p2", tiles.get("11,10")!, NOW)).toBe(false);
  });

  it("ignores a fort still under construction", () => {
    const tiles = tilesOf(fortTile(10, 10, { status: "under_construction" }), tile(11, 10));
    expect(isInOwnFortPerimeter(tiles, "p1", tiles.get("11,10")!, NOW)).toBe(false);
  });
});

describe("newlyCoveredFortPerimeterKeys", () => {
  it("lists the ring when a fort finishes", () => {
    const covered = newlyCoveredFortPerimeterKeys(fortTile(10, 10, { status: "under_construction" }), fortTile(10, 10, {}));
    expect(covered?.ownerId).toBe("p1");
    expect(covered?.tileKeys).toHaveLength(8);
    expect(covered?.tileKeys).toContain("11,11");
  });

  it("lists only the outer ring when an upgrade widens the radius", () => {
    const covered = newlyCoveredFortPerimeterKeys(fortTile(10, 10, {}), fortTile(10, 10, { variant: "TITANIUM_BASTION" }));
    expect(covered?.tileKeys).toHaveLength(16);
    expect(covered?.tileKeys).toContain("12,12");
    expect(covered?.tileKeys).not.toContain("11,11");
  });

  it("lists nothing when the radius does not grow or the fort changes hands", () => {
    expect(newlyCoveredFortPerimeterKeys(fortTile(10, 10, {}), fortTile(10, 10, {}))).toBeUndefined();
    const captured = { ...fortTile(10, 10, {}), ownerId: "p2" } as DomainTileState;
    expect(newlyCoveredFortPerimeterKeys(fortTile(10, 10, { status: "under_construction" }), captured)).toBeUndefined();
  });
});
