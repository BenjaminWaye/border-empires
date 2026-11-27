import { clearForestOnTownOrDockTile } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

// A relocated Refuge settlement becomes a town on a tile that had none, so its
// forest (if any) is cleared the same way worldgen towns are (see
// clearForestOnTownOrDockTile) -- keeping the sim in step with the client,
// which clears forest under any town tile it merges.
export const buildRelocatedSettlementTile = (target: DomainTileState, namePrefix: string, population: number): DomainTileState => {
  const relocated: DomainTileState = {
    ...target,
    ownershipState: "SETTLED",
    town: {
      name: `${namePrefix} ${target.x},${target.y}`,
      type: "FARMING",
      populationTier: "SETTLEMENT",
      population
    }
  };
  clearForestOnTownOrDockTile(relocated);
  return relocated;
};

// Where a Refuge settlement goes: the oldest remaining owned land tile with no town yet.
export const firstTownlessOwnedLandKey = (
  tiles: ReadonlyMap<string, DomainTileState>,
  territoryTileKeys: Iterable<string>,
  playerId: string
): string | undefined => {
  for (const tileKey of territoryTileKeys) {
    const tile = tiles.get(tileKey);
    if (tile && tile.terrain === "LAND" && tile.ownerId === playerId && !tile.town) return tileKey;
  }
  return undefined;
};
