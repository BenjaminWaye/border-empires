import { townTerrainProfile, supportRingCandidates, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { supportTileBelongsToTown } from "./economy-network-support-ring.js";

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

export const customsHouseTradeMultiplierForDock = (
  dockTileKey: string,
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  const [rawX, rawY] = dockTileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  for (const { tile: candidate } of supportRingCandidates(tiles, x, y, 1)) {
    const candidateKey = keyFor(candidate.x, candidate.y);
    if (candidate.ownerId !== playerId || candidate.ownershipState !== "SETTLED" || candidate.economicStructure?.type !== "CUSTOMS_HOUSE" || candidate.economicStructure.status !== "active" || dormantEconomicStructureKeys.has(candidateKey)) continue;
    for (const town of tiles.values()) {
      if (town.ownerId !== playerId || town.ownershipState !== "SETTLED" || !town.town) continue;
      if (supportTileBelongsToTown(playerId, candidate, town, tiles)) return townTerrainProfile(town.town.terrainProfile).goldMultiplier;
    }
  }
  return 1;
};
