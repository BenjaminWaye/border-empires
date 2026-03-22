import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { exposureWeightFromSides, wrapX, wrapY } from "./math.js";
import type { PlayerId, Terrain, Tile } from "./types.js";

const neighbors = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

export type TileLookup = (x: number, y: number) => Tile;
export type AllyLookup = (playerId: PlayerId, maybeAllyId: PlayerId) => boolean;

const isBarrier = (terrain: Terrain): boolean => terrain === "SEA" || terrain === "MOUNTAIN";

const isSameSide = (playerId: PlayerId, tileOwnerId: PlayerId | undefined, isAlly: AllyLookup): boolean => {
  if (!tileOwnerId) return false;
  return tileOwnerId === playerId || isAlly(playerId, tileOwnerId);
};

const isExposedSide = (
  ownerId: PlayerId | undefined,
  neighborTerrain: Terrain,
  neighborOwnerId: PlayerId | undefined,
  isAlly: AllyLookup
): boolean => {
  if (!ownerId) return false;
  if (isBarrier(neighborTerrain)) return false;
  return !isSameSide(ownerId, neighborOwnerId, isAlly);
};

export interface OwnershipChangeDelta {
  deltaByPlayer: Map<PlayerId, { dT: number; dE: number }>;
}

const bump = (deltaByPlayer: Map<PlayerId, { dT: number; dE: number }>, playerId: PlayerId, dT: number, dE: number): void => {
  const current = deltaByPlayer.get(playerId) ?? { dT: 0, dE: 0 };
  current.dT += dT;
  current.dE += dE;
  deltaByPlayer.set(playerId, current);
};

const ownerFor = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  changedOwner: PlayerId | undefined,
  getTile: TileLookup
): PlayerId | undefined => {
  if (x === cx && y === cy) return changedOwner;
  return getTile(x, y).ownerId;
};

const localExposureForPlayer = (
  playerId: PlayerId,
  cx: number,
  cy: number,
  changedOwner: PlayerId | undefined,
  getTile: TileLookup,
  isAlly: AllyLookup
): number => {
  const localTiles: Array<[number, number]> = [[cx, cy]];
  for (const [dx, dy] of neighbors) {
    localTiles.push([wrapX(cx + dx, WORLD_WIDTH), wrapY(cy + dy, WORLD_HEIGHT)]);
  }

  let exposure = 0;

  for (const [tx, ty] of localTiles) {
    const terrain = tx === cx && ty === cy ? getTile(cx, cy).terrain : getTile(tx, ty).terrain;
    if (terrain !== "LAND") continue;

    const thisOwner = ownerFor(tx, ty, cx, cy, changedOwner, getTile);
    if (thisOwner !== playerId) continue;

    let exposedSides = 0;
    for (const [dx, dy] of neighbors) {
      const nx = wrapX(tx + dx, WORLD_WIDTH);
      const ny = wrapY(ty + dy, WORLD_HEIGHT);
      const nt = getTile(nx, ny);
      const nOwner = ownerFor(nx, ny, cx, cy, changedOwner, getTile);
      if (isExposedSide(playerId, nt.terrain, nOwner, isAlly)) exposedSides += 1;
    }
    exposure += exposureWeightFromSides(exposedSides);
  }

  return exposure;
};

export const computeOwnershipChangeDelta = (
  x: number,
  y: number,
  oldOwnerId: PlayerId | undefined,
  newOwnerId: PlayerId | undefined,
  getTile: TileLookup,
  isAlly: AllyLookup
): OwnershipChangeDelta => {
  const cx = wrapX(x, WORLD_WIDTH);
  const cy = wrapY(y, WORLD_HEIGHT);

  const deltaByPlayer = new Map<PlayerId, { dT: number; dE: number }>();
  if (oldOwnerId && oldOwnerId !== newOwnerId) bump(deltaByPlayer, oldOwnerId, -1, 0);
  if (newOwnerId && newOwnerId !== oldOwnerId) bump(deltaByPlayer, newOwnerId, 1, 0);

  const affectedPlayers = new Set<PlayerId>();
  if (oldOwnerId) affectedPlayers.add(oldOwnerId);
  if (newOwnerId) affectedPlayers.add(newOwnerId);

  for (const [dx, dy] of neighbors) {
    const n = getTile(wrapX(cx + dx, WORLD_WIDTH), wrapY(cy + dy, WORLD_HEIGHT));
    if (n.ownerId) affectedPlayers.add(n.ownerId);
  }

  for (const playerId of affectedPlayers) {
    const beforeE = localExposureForPlayer(playerId, cx, cy, oldOwnerId, getTile, isAlly);
    const afterE = localExposureForPlayer(playerId, cx, cy, newOwnerId, getTile, isAlly);
    bump(deltaByPlayer, playerId, 0, afterE - beforeE);
  }

  return { deltaByPlayer };
};

export const recomputeExposureForPlayer = (
  playerId: PlayerId,
  tiles: Tile[],
  getTile: TileLookup,
  isAlly: AllyLookup
): { T: number; E: number } => {
  let T = 0;
  let E = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== playerId) continue;
    T += 1;
    let exposedSides = 0;
    for (const [dx, dy] of neighbors) {
      const n = getTile(wrapX(tile.x + dx, WORLD_WIDTH), wrapY(tile.y + dy, WORLD_HEIGHT));
      if (isExposedSide(playerId, n.terrain, n.ownerId, isAlly)) exposedSides += 1;
    }
    E += exposureWeightFromSides(exposedSides);
  }
  return { T, E };
};
