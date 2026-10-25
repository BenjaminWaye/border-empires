import { districtWrapX as wrapX, districtWrapY as wrapY } from "./district-coordinates.js";
import type { Tile } from "../client-types.js";
import type { DistrictBuildingKind } from "./district-catalog.js";

export const districtTownFixture = (x = 100, y = 100, tier: NonNullable<Tile["town"]>["populationTier"] = "METROPOLIS"): Tile => ({
  x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
  town: {
    type: "MARKET", populationTier: tier, baseGoldPerMinute: 1, goldPerMinute: 1, cap: 100,
    supportCurrent: 24, supportMax: 24, isFed: true, population: 1000, maxPopulation: 10000,
    connectedTownCount: 1, connectedTownBonus: 0, hasManufactory: true, manufactoryActive: true,
    hasIncubationEngine: false, incubationEngineActive: false
  }
});

export const districtFixture = (kind: DistrictBuildingKind = "MANUFACTORY", dx = 1, dy = 0, x = 100, y = 100): {
  tiles: Map<string, Tile>; town: Tile; building: Tile
} => {
  const town = districtTownFixture(x, y);
  const tiles = new Map<string, Tile>();
  for (let oy = -4; oy <= 4; oy += 1) for (let ox = -4; ox <= 4; ox += 1) {
    const px = wrapX(x + ox), py = wrapY(y + oy);
    tiles.set(`${px},${py}`, { x: px, y: py, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" });
  }
  const building: Tile = { x: wrapX(x + dx), y: wrapY(y + dy), terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" };
  if (kind === "OBSERVATORY") building.observatory = { ownerId: "p1", status: "active", supportAnchor: { x, y } };
  else building.economicStructure = { type: kind, ownerId: "p1", status: "active", supportAnchor: { x, y } };
  tiles.set(`${town.x},${town.y}`, town);
  tiles.set(`${building.x},${building.y}`, building);
  return { tiles, town, building };
};
