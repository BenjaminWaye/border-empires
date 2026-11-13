// Whether a House currently holds one of its charges (docs/house-charges-plan.md,
// "Charge types"), and the charge's size for the card's stats corner. Only
// garrisoned (SETTLED) land counts, as for Longest Road and island naming.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { HOUSE_CHARGE_REGION_GARRISON_SHARE, type HouseCharge } from "@border-empires/shared";
import { currentIslandClaims, islandStandingFor } from "../island-names/island-names-world.js";
import type { HouseChargesWorld } from "./house-charges-world.js";

export type HouseChargeStanding = { complete: boolean; size: number };

/** Town tiers that count as a road endpoint (same as the Longest Road record). */
const ROAD_TOWN_TIERS = new Set(["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]);
/** Town tiers that fulfil a Seat: City or larger. */
const SEAT_TIERS = new Set(["CITY", "GREAT_CITY", "METROPOLIS"]);
const TIER_ORDER = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const STEPS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const isGarrisonedBy = (tile: DomainTileState | undefined, playerId: string): tile is DomainTileState =>
  Boolean(tile && tile.terrain === "LAND" && tile.ownerId === playerId && tile.ownershipState === "SETTLED");

const targetTileKey = (targetKey: string): string => targetKey.slice(targetKey.indexOf(":") + 1);

/** Shortest road length (tiles) between two garrisoned towns through the House's garrisoned land, or undefined. */
export const charterRoadLength = (
  tiles: ReadonlyMap<string, DomainTileState>,
  world: Pick<HouseChargesWorld, "width" | "height">,
  playerId: string,
  fromKey: string,
  toKey: string
): number | undefined => {
  const from = tiles.get(fromKey);
  const to = tiles.get(toKey);
  for (const end of [from, to]) {
    if (!isGarrisonedBy(end, playerId) || !end.town || !ROAD_TOWN_TIERS.has(end.town.populationTier)) return undefined;
  }
  // BFS bounded by the House's own garrisoned component.
  const distanceByKey = new Map<string, number>([[fromKey, 0]]);
  const queue: string[] = [fromKey];
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    if (key === toKey) return distanceByKey.get(key)! + 1;
    const tile = tiles.get(key)!;
    for (const [dx, dy] of STEPS) {
      const nx = (((tile.x + dx) % world.width) + world.width) % world.width;
      const ny = (((tile.y + dy) % world.height) + world.height) % world.height;
      const nextKey = `${nx},${ny}`;
      if (distanceByKey.has(nextKey) || !isGarrisonedBy(tiles.get(nextKey), playerId)) continue;
      distanceByKey.set(nextKey, distanceByKey.get(key)! + 1);
      queue.push(nextKey);
    }
  }
  return undefined;
};

export const houseChargeStanding = (
  charge: HouseCharge,
  context: {
    readonly world: HouseChargesWorld;
    readonly tiles: ReadonlyMap<string, DomainTileState>;
    readonly players: ReadonlyMap<string, DomainPlayer>;
    readonly playerId: string;
  }
): HouseChargeStanding => {
  const { world, tiles, playerId } = context;
  const [first, second] = charge.targets;
  if (!first) return { complete: false, size: 0 };
  switch (charge.kind) {
    case "CHARTER": {
      if (!second) return { complete: false, size: 0 };
      const length = charterRoadLength(tiles, world, playerId, targetTileKey(first.key), targetTileKey(second.key));
      return { complete: length !== undefined, size: length ?? 0 };
    }
    case "SEAT": {
      const tile = tiles.get(targetTileKey(first.key));
      const tier = tile?.town?.populationTier;
      const owned = isGarrisonedBy(tile, playerId);
      return { complete: owned && Boolean(tier && SEAT_TIERS.has(tier)), size: owned && tier ? TIER_ORDER.indexOf(tier) + 1 : 0 };
    }
    case "SURVEY": {
      const island = world.islands.byId.get(targetTileKey(first.key));
      if (!island) return { complete: false, size: 0 };
      const standing = islandStandingFor(island, tiles, playerId, world.islands.width);
      const claim = currentIslandClaims(context.players).get(island.id);
      return { complete: claim?.playerId === playerId, size: standing.namerGarrisoned };
    }
    case "DESERT":
    case "TUNDRA": {
      const region = world.regions.byId.get(targetTileKey(first.key));
      if (!region) return { complete: false, size: 0 };
      let land = 0;
      let garrisoned = 0;
      for (const cell of region.cells) {
        const tile = tiles.get(`${cell % world.regions.width},${Math.floor(cell / world.regions.width)}`);
        if (!tile || tile.terrain !== "LAND") continue;
        land += 1;
        if (isGarrisonedBy(tile, playerId)) garrisoned += 1;
      }
      return { complete: land > 0 && garrisoned / land >= HOUSE_CHARGE_REGION_GARRISON_SHARE, size: garrisoned };
    }
    case "RELIC": {
      const owned = isGarrisonedBy(tiles.get(targetTileKey(first.key)), playerId);
      return { complete: owned, size: owned ? 1 : 0 };
    }
  }
};
