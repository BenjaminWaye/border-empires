import { describe, expect, it } from "vitest";
import { clientTerrainAt } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import type { ClientTownWireSummary } from "../client-tile-town-type.js";
import type { DockPair, Tile } from "../client-types.js";
import { harbourFacingAt, rotationForFacing, slipwayFitForTile, slipwayPlacementsFor } from "./client-harbour-slipways.js";

// A west island (x 2-8) facing an east island (x 15-21) across a strait, sea
// everywhere else. Dock (8,5) is on the west island's east coast; (15,5) on
// the east island's west coast.
const world = (extra: Tile[] = []): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y <= 10; y += 1) {
    for (let x = 0; x <= 23; x += 1) {
      const land = y >= 2 && y <= 8 && ((x >= 2 && x <= 8) || (x >= 15 && x <= 21));
      tiles.set(`${x},${y}`, { x, y, terrain: land ? "LAND" : "SEA" });
    }
  }
  for (const tile of extra) tiles.set(`${tile.x},${tile.y}`, tile);
  return tiles;
};
const dockPairs: DockPair[] = [{ ax: 8, ay: 5, bx: 15, by: 5 }];

describe("harbour facing", () => {
  it("turns a model built facing south toward its water on every coast", () => {
    // RY(t) maps +z (south) to (sin t, cos t) in (x, z).
    expect(rotationForFacing({ dx: 0, dy: 1 })).toBe(0);
    expect(rotationForFacing({ dx: 0, dy: -1 })).toBeCloseTo(Math.PI);
    // Regression: the old dockRotationAt gave -pi/2 for an east coast, which faces west -- inland.
    expect(rotationForFacing({ dx: 1, dy: 0 })).toBeCloseTo(Math.PI / 2);
    expect(rotationForFacing({ dx: -1, dy: 0 })).toBeCloseTo(-Math.PI / 2);
  });

  it("faces a dock toward the sea beside it", () => {
    const terrainAt = clientTerrainAt(world());
    expect(harbourFacingAt(terrainAt, 8, 5)).toEqual({ dx: 1, dy: 0 });
    expect(harbourFacingAt(terrainAt, 15, 5)).toEqual({ dx: -1, dy: 0 });
  });

  it("prefers the quay's facing on a corner beach, else the first water side", () => {
    const terrainAt = clientTerrainAt(world());
    // (8,2) has sea to the north and east.
    expect(harbourFacingAt(terrainAt, 8, 2, { dx: 1, dy: 0 })).toEqual({ dx: 1, dy: 0 });
    expect(harbourFacingAt(terrainAt, 8, 2)).toEqual({ dx: 1, dy: 0 });
    expect(harbourFacingAt(terrainAt, 8, 2, { dx: 0, dy: 1 })).toEqual({ dx: 1, dy: 0 });
  });
});

describe("slipwayFitForTile", () => {
  it("is full on open beach, shrunk beside another structure, hidden where something fills the tile", () => {
    const beach: Tile = { x: 0, y: 0, terrain: "LAND" };
    expect(slipwayFitForTile(beach)).toBe("full");
    expect(slipwayFitForTile({ ...beach, resource: "FISH" })).toBe("shrunk");
    expect(slipwayFitForTile({ ...beach, fort: { ownerId: "p", status: "active" } as NonNullable<Tile["fort"]> })).toBe("shrunk");
    expect(slipwayFitForTile({ ...beach, town: { type: "MARKET" } as ClientTownWireSummary })).toBeUndefined();
    expect(slipwayFitForTile({ ...beach, afc: { ownerId: "p", status: "active" } })).toBeUndefined();
    expect(slipwayFitForTile({ ...beach, terrain: "MOUNTAIN" })).toBeUndefined();
    expect(slipwayFitForTile(undefined)).toBeUndefined();
  });
});

describe("slipwayPlacementsFor", () => {
  it("puts a slipway on each beach beside both docks, facing the water, and none on the docks or inland", () => {
    const placements = slipwayPlacementsFor({ dockPairs, tiles: world() });
    expect([...placements.keys()].sort()).toEqual(["15,4", "15,6", "8,4", "8,6"]);
    expect(placements.get("8,4")).toMatchObject({ facing: { dx: 1, dy: 0 }, fit: "full" });
    expect(placements.get("15,6")).toMatchObject({ facing: { dx: -1, dy: 0 }, fit: "full" });
  });

  it("shrinks a slipway beside a resource and leaves out a beach with a town", () => {
    const tiles = world([
      { x: 8, y: 4, terrain: "LAND", resource: "FISH" },
      { x: 8, y: 6, terrain: "LAND", town: { type: "MARKET" } as ClientTownWireSummary }
    ]);
    const placements = slipwayPlacementsFor({ dockPairs, tiles });
    expect(placements.get("8,4")?.fit).toBe("shrunk");
    expect(placements.has("8,6")).toBe(false);
  });
});
