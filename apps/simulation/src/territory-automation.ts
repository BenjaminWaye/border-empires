import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { frontierNeighborCoords } from "./frontier-topology.js";

export const FORT_AUTO_FRONTIER_RADIUS = 1;
export const TOWN_AUTO_FRONTIER_RADIUS = 1;

export const coordsInChebyshevRadius = (
  centerX: number,
  centerY: number,
  radius: number
): Array<{ x: number; y: number }> => {
  const coords: Array<{ x: number; y: number }> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      coords.push({
        x: wrapX(centerX + dx, WORLD_WIDTH),
        y: wrapY(centerY + dy, WORLD_HEIGHT)
      });
    }
  }
  return coords;
};

export const isActiveFortAnchor = (
  tile: DomainTileState,
  playerId: string,
  nowMs: number
): boolean =>
  tile.ownerId === playerId &&
  tile.fort?.ownerId === playerId &&
  tile.fort.status === "active" &&
  (tile.fort.disabledUntil ?? 0) <= nowMs;

export const isSettledTownAnchor = (tile: DomainTileState, playerId: string): boolean =>
  tile.ownerId === playerId &&
  tile.ownershipState === "SETTLED" &&
  tile.terrain === "LAND" &&
  Boolean(tile.town);

export const isAutoClaimTarget = (tile: DomainTileState | undefined): tile is DomainTileState =>
  Boolean(tile && tile.terrain === "LAND" && !tile.ownerId);

export const isAutoSettlementTarget = (
  tile: DomainTileState | undefined,
  playerId: string
): tile is DomainTileState =>
  Boolean(
    tile &&
      tile.terrain === "LAND" &&
      tile.ownerId === playerId &&
      tile.ownershipState === "FRONTIER"
  );

export const isValuableAutoSettlementTarget = (
  tile: DomainTileState | undefined,
  playerId: string
): tile is DomainTileState =>
  Boolean(isAutoSettlementTarget(tile, playerId) && (tile.resource || tile.town || tile.dockId));

export const siegeAutoAttackCandidates = (
  outpost: DomainTileState,
  playerId: string,
  getTile: (x: number, y: number) => DomainTileState | undefined
): DomainTileState[] =>
  frontierNeighborCoords(outpost.x, outpost.y)
    .map(({ x, y }) => getTile(x, y))
    .filter(
      (tile): tile is DomainTileState =>
        Boolean(
          tile &&
            tile.terrain === "LAND" &&
            tile.ownerId &&
            tile.ownerId !== playerId &&
            (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED")
        )
    )
    .sort((left, right) => {
      const stateScore = (tile: DomainTileState): number => tile.ownershipState === "FRONTIER" ? 0 : 1;
      const townScore = (tile: DomainTileState): number => tile.town ? 1 : 0;
      const fortScore = (tile: DomainTileState): number => tile.fort?.status === "active" ? 1 : 0;
      return (
        stateScore(left) - stateScore(right) ||
        fortScore(left) - fortScore(right) ||
        townScore(left) - townScore(right) ||
        left.x - right.x ||
        left.y - right.y
      );
    });
