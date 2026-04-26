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

const settlementTileScore = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): { score: number; strategic: boolean } => {
  const supportNeed = adjacentTownSupportNeed(playerId, tile, tiles);
  const strategic = Boolean(tile.town || tile.dockId || tile.resource || supportNeed > 0);
  let score = 0;
  if (tile.town) score += 1000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  score += supportNeed * 80;
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  score -= Math.abs(tile.x) * 0.0001 + Math.abs(tile.y) * 0.0001;
  return { score, strategic };
};

export const settlementSupportNeedForTile = adjacentTownSupportNeed;

export const hasStrategicSettlementValue = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => settlementTileScore(playerId, tile, tiles).strategic;

export const rankSettlementTile = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => settlementTileScore(playerId, tile, tiles).score;

const isBetterSettlementCandidate = (
  candidate: DomainTileState,
  candidateScore: number,
  current: DomainTileState | undefined,
  currentScore: number
): boolean => {
  if (!current) return true;
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  if (candidate.x !== current.x) return candidate.x < current.x;
  return candidate.y < current.y;
};

export const chooseBestStrategicSettlementTile = (
  playerId: string,
  candidates: Iterable<DomainTileState>,
  tiles: ReadonlyMap<string, DomainTileState>,
  isPending?: (tile: DomainTileState) => boolean
): DomainTileState | undefined => {
  let bestTile: DomainTileState | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tile of candidates) {
    if (tile.terrain !== "LAND" || tile.ownerId !== playerId) continue;
    if (isPending?.(tile)) continue;
    const { score, strategic } = settlementTileScore(playerId, tile, tiles);
    if (!strategic) continue;
    if (isBetterSettlementCandidate(tile, score, bestTile, bestScore)) {
      bestTile = tile;
      bestScore = score;
    }
  }
  return bestTile;
};
