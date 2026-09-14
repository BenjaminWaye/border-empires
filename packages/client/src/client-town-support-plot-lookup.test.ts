import { describe, expect, it } from "vitest";
import { supportPlotAnchorTown, townSupportPlotEntries, type TownSupportLookupDeps } from "./client-town-support-plot-lookup.js";
import type { Tile } from "./client-types.js";
import type { ClientTownWireSummary } from "./client-tile-town-type.js";

// REGRESSION (2026-09-10): this file's anchor/entries walks used to be
// hardcoded to a flat 8-tile (-1..1) square, never consulting
// supportRingRadiusForTier -- so a GREAT_CITY/METROPOLIS town's second ring
// (distance-2 tiles) never rendered or was interactable client-side, even
// while the server-side economic bonus was live for it. These tests fail
// against that hardcoded version (8 entries / no anchor found at distance 2)
// and pass once the radius is tier-aware.

const WORLD_SIZE = 2000;
const wrapCoord = (n: number): number => ((n % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
const keyFor = (x: number, y: number): string => `${x},${y}`;

const landTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const wireTown = (populationTier: ClientTownWireSummary["populationTier"]): ClientTownWireSummary => ({
  type: "MARKET",
  baseGoldPerMinute: 0,
  supportCurrent: 0,
  supportMax: 0,
  goldPerMinute: 0,
  cap: 0,
  isFed: true,
  population: 0,
  maxPopulation: 0,
  populationTier,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  hasMintworks: false,
  mintworksActive: false,
  hasGranary: false,
  granaryActive: false
});

const townTile = (x: number, y: number, populationTier: "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS", ownerId = "me"): Tile =>
  landTile(x, y, {
    ownerId,
    ownershipState: "SETTLED",
    town: wireTown(populationTier)
  });

const depsFor = (tiles: ReadonlyMap<string, Tile>): TownSupportLookupDeps => ({
  tiles,
  wrapX: wrapCoord,
  wrapY: wrapCoord,
  keyFor,
  terrainAt: () => "LAND",
  me: "me"
});

describe("townSupportPlotEntries", () => {
  it("returns only the base 8-tile ring for a CITY-tier town", () => {
    const anchor = townTile(10, 10, "CITY");
    const tiles = new Map<string, Tile>([[keyFor(10, 10), anchor]]);
    const entries = townSupportPlotEntries(anchor, depsFor(tiles));
    expect(entries).toHaveLength(8);
    expect(entries.every((e) => Math.max(Math.abs(e.dx), Math.abs(e.dy)) <= 1)).toBe(true);
  });

  it("returns the full 24-tile ring for a GREAT_CITY-tier town", () => {
    const anchor = townTile(10, 10, "GREAT_CITY");
    const tiles = new Map<string, Tile>([[keyFor(10, 10), anchor]]);
    const entries = townSupportPlotEntries(anchor, depsFor(tiles));
    expect(entries).toHaveLength(24);
    expect(entries.some((e) => Math.max(Math.abs(e.dx), Math.abs(e.dy)) === 2)).toBe(true);
  });

  it("returns the full 24-tile ring for a METROPOLIS-tier town", () => {
    const anchor = townTile(10, 10, "METROPOLIS");
    const tiles = new Map<string, Tile>([[keyFor(10, 10), anchor]]);
    const entries = townSupportPlotEntries(anchor, depsFor(tiles));
    expect(entries).toHaveLength(24);
  });
});

describe("supportPlotAnchorTown", () => {
  it("finds a GREAT_CITY anchor two tiles away, not just an adjacent one", () => {
    const anchor = townTile(10, 10, "GREAT_CITY");
    const farSupportTile = landTile(12, 10); // distance 2 from the anchor
    const tiles = new Map<string, Tile>([
      [keyFor(10, 10), anchor],
      [keyFor(12, 10), farSupportTile]
    ]);
    const found = supportPlotAnchorTown(farSupportTile, depsFor(tiles));
    expect(found).toMatchObject({ x: 10, y: 10 });
  });

  it("does not treat a distance-2 CITY-tier town as an anchor (its own radius is only 1)", () => {
    const anchor = townTile(10, 10, "CITY");
    const farSupportTile = landTile(12, 10); // distance 2 -- outside CITY's own radius
    const tiles = new Map<string, Tile>([
      [keyFor(10, 10), anchor],
      [keyFor(12, 10), farSupportTile]
    ]);
    const found = supportPlotAnchorTown(farSupportTile, depsFor(tiles));
    expect(found).toBeUndefined();
  });
});
