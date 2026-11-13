import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";

export interface LandmarkTile {
  afc?: object | boolean | null | undefined;
  naturalWonder?: object | boolean | null | undefined;
}

export function landmarkConstructionBlocker(
  tiles: { get(key: string): LandmarkTile | undefined },
  x: number,
  y: number
): "AFC" | "relic" | undefined {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const tile = tiles.get(`${wrapX(x + dx, WORLD_WIDTH)},${wrapY(y + dy, WORLD_HEIGHT)}`);
      if (tile?.afc) return "AFC";
      if (tile?.naturalWonder) return "relic";
    }
  }
  return undefined;
}

/**
 * An AFC or relic and its 3×3 footprint are one super tile: the footprint
 * tiles carry the centre's owner and ownership state, and an action aimed at
 * any of the nine lands on the centre. Towns, docks and non-land tiles in an
 * old footprint keep their own ownership.
 */
export interface SuperTileMember extends LandmarkTile {
  x: number;
  y: number;
  terrain?: string | undefined;
  town?: unknown;
  dockId?: unknown;
  fort?: unknown;
  observatory?: unknown;
  siegeBattery?: unknown;
  economicStructure?: unknown;
}

const isLandmark = (tile: LandmarkTile | undefined): boolean => Boolean(tile?.afc || tile?.naturalWonder);

/** The AFC/relic centre whose footprint holds (x, y) -- the tile itself when it is the landmark. */
export function landmarkFootprintCentre<T extends SuperTileMember>(
  tiles: { get(key: string): T | undefined },
  x: number,
  y: number
): T | undefined {
  const own = tiles.get(`${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`);
  if (isLandmark(own)) return own;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const tile = tiles.get(`${wrapX(x + dx, WORLD_WIDTH)},${wrapY(y + dy, WORLD_HEIGHT)}`);
      if (isLandmark(tile)) return tile;
    }
  }
  return undefined;
}

/**
 * Whether a footprint tile shares its landmark's ownership: plain land with no
 * town, dock, landmark or building of its own (buildings predating the
 * footprint rule stay with their owner).
 */
export const followsLandmarkOwnership = (tile: SuperTileMember): boolean =>
  tile.terrain === "LAND" && !tile.town && !tile.dockId && !isLandmark(tile) &&
  !tile.fort && !tile.observatory && !tile.siegeBattery && !tile.economicStructure;

/** The landmark centre plus every footprint tile that follows its ownership. */
export function landmarkSuperTileMembers<T extends SuperTileMember>(
  tiles: { get(key: string): T | undefined },
  centre: T
): T[] {
  const members: T[] = [centre];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles.get(`${wrapX(centre.x + dx, WORLD_WIDTH)},${wrapY(centre.y + dy, WORLD_HEIGHT)}`);
      if (tile && followsLandmarkOwnership(tile)) members.push(tile);
    }
  }
  return members;
}

/** The super tile (x, y) belongs to, if it is a member of one. */
export function landmarkSuperTileAt<T extends SuperTileMember>(
  tiles: { get(key: string): T | undefined },
  x: number,
  y: number
): { centre: T; members: T[] } | undefined {
  const centre = landmarkFootprintCentre(tiles, x, y);
  if (!centre) return undefined;
  const members = landmarkSuperTileMembers(tiles, centre);
  return members.some(member => member.x === wrapX(x, WORLD_WIDTH) && member.y === wrapY(y, WORLD_HEIGHT)) ? { centre, members } : undefined;
}
