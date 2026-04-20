import type { DomainTileState } from "@border-empires/game-domain";

const resourceScore = (resource: DomainTileState["resource"] | undefined): number => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return 180;
    case "IRON":
    case "WOOD":
    case "FUR":
      return 120;
    case "GEMS":
    case "OIL":
      return 90;
    default:
      return 0;
  }
};

const adjacentTownSupportNeed = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => {
  let need = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED" || !neighbor.town) continue;
      const supportMax = Math.max(0, neighbor.town.supportMax ?? 0);
      const supportCurrent = Math.max(0, neighbor.town.supportCurrent ?? 0);
      need += Math.max(0, supportMax - supportCurrent);
    }
  }
  return need;
};

export const settlementSupportNeedForTile = adjacentTownSupportNeed;

export const hasStrategicSettlementValue = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => Boolean(tile.town || tile.dockId || tile.resource || adjacentTownSupportNeed(playerId, tile, tiles) > 0);

export const rankSettlementTile = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => {
  let score = 0;
  if (tile.town) score += 1000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  score += adjacentTownSupportNeed(playerId, tile, tiles) * 80;
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  score -= Math.abs(tile.x) * 0.0001 + Math.abs(tile.y) * 0.0001;
  return score;
};
