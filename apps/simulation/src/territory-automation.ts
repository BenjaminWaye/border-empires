import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { frontierNeighborCoords } from "./frontier-topology.js";

/**
 * Chebyshev distance between two points, without world-wrap (used for sweep
 * targeting where radius is small enough that wrap is irrelevant).
 */
export const chebyshevDistanceSimple = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Sweep attack candidate tiles: all enemy-player and barbarian tiles within
 * chebyshev distance <= radius from the outpost tile. Returns tiles sorted by
 * distance ascending; tie-break: lower x first, then lower y.
 */
export const sweepAttackCandidates = (
  outpost: DomainTileState,
  playerId: string,
  radius: number,
  getTile: (x: number, y: number) => DomainTileState | undefined
): DomainTileState[] =>
  coordsInChebyshevRadius(outpost.x, outpost.y, radius)
    .map(({ x, y }) => getTile(x, y))
    .filter(
      (tile): tile is DomainTileState =>
        Boolean(
          tile &&
            tile.terrain === "LAND" &&
            tile.ownerId &&
            tile.ownerId !== playerId &&
            (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED" || tile.ownershipState === "BARBARIAN")
        )
    )
    .sort((a, b) => {
      const distA = chebyshevDistanceSimple(outpost.x, outpost.y, a.x, a.y);
      const distB = chebyshevDistanceSimple(outpost.x, outpost.y, b.x, b.y);
      return distA - distB || a.x - b.x || a.y - b.y;
    });

export const FORT_AUTO_FRONTIER_RADIUS = 1;
export const TOWN_AUTO_FRONTIER_RADIUS = 1;
export const FRONTIER_DECAY_MS = 10 * 60_000;
export const FRONTIER_DECAY_WARNING_MS = 60_000;
export const FORT_PATROL_GRACE_MS = 20_000;
export const MAX_FORT_AUTO_FRONTIER_RADIUS = 4;

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

export const fortAutoFrontierRadiusForTile = (
  tile: DomainTileState,
  playerId: string,
  nowMs: number
): number => {
  if (
    tile.ownerId === playerId &&
    tile.economicStructure?.ownerId === playerId &&
    tile.economicStructure.type === "WOODEN_FORT" &&
    tile.economicStructure.status === "active"
  ) {
    return 1;
  }
  if (!isActiveFortAnchor(tile, playerId, nowMs)) return 0;
  if (tile.fort?.variant === "THUNDER_BASTION") return MAX_FORT_AUTO_FRONTIER_RADIUS;
  if (tile.fort?.variant === "IRON_BASTION") return 3;
  return 2;
};

export const isSettledTownAnchor = (tile: DomainTileState, playerId: string): boolean =>
  tile.ownerId === playerId &&
  tile.ownershipState === "SETTLED" &&
  tile.terrain === "LAND" &&
  Boolean(tile.town && tile.town.populationTier !== "SETTLEMENT");

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

export const isAutoSettlementEligibleTarget = (
  tile: DomainTileState | undefined,
  playerId: string,
  hasTownSupport: (tile: DomainTileState) => boolean
): tile is DomainTileState => {
  if (!isAutoSettlementTarget(tile, playerId)) return false;
  return Boolean(tile.resource || tile.town || tile.dockId || hasTownSupport(tile));
};

export const orderedAutoSettlementTileKeys = (
  playerId: string,
  territoryTileKeys: Iterable<string>,
  deps: {
    getTile: (tileKey: string) => DomainTileState | undefined;
    isBlocked: (tileKey: string) => boolean;
    hasTownSupport: (tile: DomainTileState) => boolean;
  }
): string[] => {
  const output: string[] = [];
  for (const tileKey of territoryTileKeys) {
    if (deps.isBlocked(tileKey)) continue;
    const tile = deps.getTile(tileKey);
    if (!isAutoSettlementEligibleTarget(tile, playerId, deps.hasTownSupport)) continue;
    output.push(tileKey);
  }
  return output;
};

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

export const fortAutoAttackCandidates = (
  fortTile: DomainTileState,
  playerId: string,
  radius: number,
  getTile: (x: number, y: number) => DomainTileState | undefined
): DomainTileState[] =>
  coordsInChebyshevRadius(fortTile.x, fortTile.y, radius)
    .map(({ x, y }) => getTile(x, y))
    .filter(
      (tile): tile is DomainTileState =>
        Boolean(
          tile &&
            tile.terrain === "LAND" &&
            tile.ownerId &&
            tile.ownerId !== playerId &&
            tile.ownershipState === "FRONTIER" &&
            !tile.fort &&
            (tile.economicStructure?.type !== "WOODEN_FORT" || tile.economicStructure.status !== "active")
        )
    )
    .sort((left, right) => {
      const resourceScore = (tile: DomainTileState): number => tile.resource || tile.town || tile.dockId ? 1 : 0;
      return (
        resourceScore(right) - resourceScore(left) ||
        left.x - right.x ||
        left.y - right.y
      );
    });
