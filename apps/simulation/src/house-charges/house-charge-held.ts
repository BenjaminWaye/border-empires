// Whether a House currently holds one of its charges (docs/house-charges-plan.md,
// "Charge types"), and the charge's size for the card's stats corner. A
// Writ of Correction counts AFCs by founder (afcFoundedBy), not by tile. Only
// garrisoned (SETTLED) land counts, as for Longest Road and island naming.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { HOUSE_CHARGE_METROPOLIS_COUNT, HOUSE_CHARGE_REGION_GARRISON_SHARE, afcFoundedBy, type HouseCharge } from "@border-empires/shared";
import { currentIslandClaims, islandStandingFor } from "../island-names/island-names-world.js";
import type { HouseChargesWorld } from "./house-charges-world.js";

export type HouseChargeStanding = {
  complete: boolean;
  size: number;
  /** While complete: the tiles that make up the card art (a Charter's road, or the whole area). */
  shape?: Array<{ x: number; y: number }>;
};

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
  world: Pick<HouseChargesWorld, "width" | "height"> & Partial<Pick<HouseChargesWorld, "dockLinks">>,
  playerId: string,
  fromKey: string,
  toKey: string
): number | undefined => charterRoad(tiles, world, playerId, fromKey, toKey)?.length;

type Point = { x: number; y: number };
type RoadWorld = Pick<HouseChargesWorld, "width" | "height"> & Partial<Pick<HouseChargesWorld, "dockLinks">>;

/**
 * The shortest road between two garrisoned towns, as its tiles from one town
 * to the other, or undefined. The road runs over the House's garrisoned land
 * (4-neighbour) and may cross the sea along dock routes: from a dock the
 * House garrisons to a dock it links to (worldgen dock links), when the House
 * garrisons that dock too. Chains of such crossings count, as they would for
 * a House sailing between its own harbours.
 */
export const charterRoad = (
  tiles: ReadonlyMap<string, DomainTileState>,
  world: RoadWorld,
  playerId: string,
  fromKey: string,
  toKey: string
): Point[] | undefined => {
  const from = tiles.get(fromKey);
  const to = tiles.get(toKey);
  for (const end of [from, to]) {
    if (!isGarrisonedBy(end, playerId) || !end.town || !ROAD_TOWN_TIERS.has(end.town.populationTier)) return undefined;
  }
  // BFS bounded by the House's own garrisoned component plus its linked docks.
  const previousByKey = new Map<string, string | undefined>([[fromKey, undefined]]);
  const queue: string[] = [fromKey];
  const visit = (nextKey: string, key: string): void => {
    if (previousByKey.has(nextKey) || !isGarrisonedBy(tiles.get(nextKey), playerId)) return;
    previousByKey.set(nextKey, key);
    queue.push(nextKey);
  };
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    if (key === toKey) {
      const path: Point[] = [];
      for (let step: string | undefined = key; step !== undefined; step = previousByKey.get(step)) {
        const stepTile = tiles.get(step)!;
        path.push({ x: stepTile.x, y: stepTile.y });
      }
      return path.reverse();
    }
    const tile = tiles.get(key)!;
    for (const [dx, dy] of STEPS) {
      const nx = (((tile.x + dx) % world.width) + world.width) % world.width;
      const ny = (((tile.y + dy) % world.height) + world.height) % world.height;
      visit(`${nx},${ny}`, key);
    }
    if (tile.dockId) for (const linkedKey of world.dockLinks?.get(key) ?? []) visit(linkedKey, key);
  }
  return undefined;
};

/** The area's tiles the House actually garrisons: the card art shows what was held, not the whole region. */
const garrisonedPoints = (cells: Int32Array, width: number, tiles: ReadonlyMap<string, DomainTileState>, playerId: string): Point[] => {
  const points: Point[] = [];
  for (const cell of cells) {
    const point = { x: cell % width, y: Math.floor(cell / width) };
    if (isGarrisonedBy(tiles.get(`${point.x},${point.y}`), playerId)) points.push(point);
  }
  return points;
};

export const houseChargeStanding = (
  charge: HouseCharge,
  context: {
    readonly world: HouseChargesWorld;
    readonly tiles: ReadonlyMap<string, DomainTileState>;
    readonly players: ReadonlyMap<string, DomainPlayer>;
    readonly playerId: string;
    /** Every AFC tile on the map (Writ of Correction); scanned from `tiles` when absent. */
    readonly afcTiles?: () => readonly DomainTileState[];
  }
): HouseChargeStanding => {
  const { world, tiles, playerId } = context;
  const [first, second] = charge.targets;
  if (!first) return { complete: false, size: 0 };
  switch (charge.kind) {
    case "CHARTER": {
      if (!second) return { complete: false, size: 0 };
      const road = charterRoad(tiles, world, playerId, targetTileKey(first.key), targetTileKey(second.key));
      return road ? { complete: true, size: road.length, shape: road } : { complete: false, size: 0 };
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
      const complete = claim?.playerId === playerId;
      return { complete, size: standing.namerGarrisoned, ...(complete ? { shape: garrisonedPoints(island.cells, world.islands.width, tiles, playerId) } : {}) };
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
      const complete = land > 0 && garrisoned / land >= HOUSE_CHARGE_REGION_GARRISON_SHARE;
      return { complete, size: garrisoned, ...(complete ? { shape: garrisonedPoints(region.cells, world.regions.width, tiles, playerId) } : {}) };
    }
    case "CORRECTION": {
      // Any AFC the named House founded, wherever it stands, owned and garrisoned by this House.
      const rivalId = targetTileKey(first.key);
      const afcs = context.afcTiles ? context.afcTiles() : [...tiles.values()].filter((tile) => tile.afc);
      const held = afcs.filter((tile) => tile.afc?.ownerId === playerId && isGarrisonedBy(tile, playerId) && afcFoundedBy(tile.afc) === rivalId);
      return held.length > 0 ? { complete: true, size: held.length, shape: held.map(({ x, y }) => ({ x, y })) } : { complete: false, size: 0 };
    }
    case "METROPOLIS": {
      const islandId = targetTileKey(first.key);
      const metropolises = world.towns
        .filter((town) => town.islandId === islandId)
        .map((town) => tiles.get(town.key))
        .filter((tile): tile is DomainTileState => isGarrisonedBy(tile, playerId) && tile?.town?.populationTier === "METROPOLIS");
      const complete = metropolises.length >= HOUSE_CHARGE_METROPOLIS_COUNT;
      return { complete, size: metropolises.length, ...(complete ? { shape: metropolises.map(({ x, y }) => ({ x, y })) } : {}) };
    }
    case "RELIC": {
      const owned = isGarrisonedBy(tiles.get(targetTileKey(first.key)), playerId);
      return { complete: owned, size: owned ? 1 : 0 };
    }
  }
};
