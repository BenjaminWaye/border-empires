import { describe, expect, it } from "vitest";
import type { DomainTileState } from "./index/index.js";
import { starterSiteQuality } from "./starter-site-quality.js";
import { computeFairSpawnSites } from "./server-worldgen-fair-spawn-sites.js";
import { EXPAND_MANPOWER_COST, SETTLE_MANPOWER_COST, STARTING_CAPITAL_MANPOWER_CAP, TOWN_REACH_RADIUS, OUTPOST_REACH_RADIUS, relayBeaconManpowerCost } from "@border-empires/shared";
import { STARTER_FOOD_DISTANCE, STARTER_FOOD_SUPPLY_DISTANCE, STARTER_ECONOMY_DISTANCE } from "./starter-site-quality.js";

const world = (): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < 30; y += 1) for (let x = 0; x < 30; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
  tiles.get("18,10")!.town = { type: "MARKET", populationTier: "TOWN" };
  for (const key of ["13,10", "14,10", "15,10", "16,10"]) tiles.get(key)!.resource = "FARM";
  return tiles;
};

describe("starter site opening economy", () => {
  it("requires four slots, an immediately reachable food target and a town within eight", () => {
    expect(starterSiteQuality(world(), 10, 10, 30, 30)).toEqual({ foodDistance: 3, townDistance: 8, foodSlots: 4 });
    const tiles = world();
    delete tiles.get("16,10")!.resource;
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it("counts fish as two slots", () => {
    const tiles = world();
    for (const key of ["15,10", "16,10"]) delete tiles.get(key)!.resource;
    for (const key of ["13,10", "14,10"]) tiles.get(key)!.resource = "FISH";
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)?.foodSlots).toBe(4);
  });
  it("rejects food spread beyond the six-step opening supply budget", () => {
    const tiles = world();
    delete tiles.get("16,10")!.resource;
    tiles.get("17,10")!.resource = "FARM";
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it("keeps the conservative opening inside the starting manpower budget", () => {
    expect(STARTER_FOOD_DISTANCE).toBeLessThanOrEqual(TOWN_REACH_RADIUS);
    expect(STARTER_ECONOMY_DISTANCE).toBeLessThanOrEqual(TOWN_REACH_RADIUS + OUTPOST_REACH_RADIUS);
    const claims = STARTER_FOOD_DISTANCE + 3 * STARTER_FOOD_SUPPLY_DISTANCE + STARTER_ECONOMY_DISTANCE;
    const beaconCosts = [0, 1, 2, 3].reduce((sum, count) => sum + relayBeaconManpowerCost(count), 0);
    // Four FARMs + a town, with at most three food beacons and one town beacon.
    expect(claims * EXPAND_MANPOWER_COST + 9 * SETTLE_MANPOWER_COST + beaconCosts).toBeLessThanOrEqual(STARTING_CAPITAL_MANPOWER_CAP);
  });
  it("rejects a first food goal outside the AFC's starting reach", () => {
    const tiles = world();
    delete tiles.get("13,10")!.resource;
    tiles.get("16,11")!.resource = "FARM";
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it.each(["SEA", "MOUNTAIN"] as const)("rejects a nearby town behind a %s wall", (terrain) => {
    const tiles = world();
    for (let y = 0; y < 30; y += 1) tiles.get(`17,${y}`)!.terrain = terrain;
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it("rejects routes across another player's territory", () => {
    const tiles = world();
    for (let y = 0; y < 30; y += 1) tiles.get(`17,${y}`)!.ownerId = "enemy";
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it("does not count already captured food or towns", () => {
    const tiles = world();
    tiles.get("18,10")!.ownerId = "enemy";
    expect(starterSiteQuality(tiles, 10, 10, 30, 30)).toBeUndefined();
  });
  it("can exclude neutral goals and paths already inside rival reach", () => {
    expect(starterSiteQuality(world(), 10, 10, 30, 30, (x) => x < 14)).toBeUndefined();
  });
  it("preserves town clearance and uses wrapped land routes", () => {
    const tiles = world();
    delete tiles.get("18,10")!.town;
    tiles.get("4,10")!.town = { type: "MARKET", populationTier: "TOWN" };
    for (const key of ["13,10", "14,10", "15,10", "16,10"]) delete tiles.get(key)!.resource;
    for (const key of ["27,10", "26,10", "25,10", "24,10"]) tiles.get(key)!.resource = "FARM";
    expect(starterSiteQuality(tiles, 29, 10, 30, 30)).toEqual({ foodDistance: 2, townDistance: 5, foodSlots: 4 });
    tiles.get("1,10")!.town = { type: "MARKET", populationTier: "TOWN" };
    expect(starterSiteQuality(tiles, 29, 10, 30, 30)).toBeUndefined();
  });
  it("never fills a strict roster with amenity-free land", () => {
    const tiles = [...world().values()].map((tile) => ({ x: tile.x, y: tile.y, terrain: tile.terrain }));
    expect(computeFairSpawnSites(tiles, 50, { requireStarterEconomy: true })).toEqual([]);
  });
  it("keeps strict sites dry and ten wrapped tiles apart", () => {
    const tiles = world();
    const sites = computeFairSpawnSites([...tiles.values()], 50, { requireStarterEconomy: true, width: 30, height: 30 });
    expect(sites.length).toBeGreaterThan(0);
    for (const [index, site] of sites.entries()) {
      expect(starterSiteQuality(tiles, site.x, site.y, 30, 30)).toBeDefined();
      for (const other of sites.slice(index + 1)) {
        const dx = Math.abs(site.x - other.x); const dy = Math.abs(site.y - other.y);
        expect(Math.max(Math.min(dx, 30 - dx), Math.min(dy, 30 - dy))).toBeGreaterThanOrEqual(10);
      }
    }
    // A tiny wet footprint cannot qualify by the permissive dry preference's fallback.
    for (const tile of tiles.values()) if (tile.x % 2 === 0 && tile.y % 2 === 0) tile.terrain = "SEA";
    expect(computeFairSpawnSites([...tiles.values()], 50, { requireStarterEconomy: true, width: 30, height: 30 })).toEqual([]);
  });
});
