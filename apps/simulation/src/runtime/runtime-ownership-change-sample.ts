import type { DomainTileState } from "@border-empires/game-domain";

type TownPopulationTier = NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]>;

export type OwnershipChangeSample = {
  tileKey: string;
  x: number;
  y: number;
  previousOwnerId: string | undefined;
  nextOwnerId: string | undefined;
  commandId: string;
  hadTown: boolean;
  townLost: boolean;
  hadOwnershipState: string | undefined;
  previousTownPopulationTier: TownPopulationTier | undefined;
};

// Builds the onOwnershipChange sample for a tile write, or undefined if
// nothing worth reporting changed (same owner, town still present). townLost
// fires whenever a town existed before and is gone now (e.g. capturedTownAftermath
// razing a SETTLEMENT-tier town on capture) — distinct from ownerId changing,
// since a captured town above SETTLEMENT tier usually survives.
export const buildOwnershipChangeSample = (
  tileKey: string,
  tile: DomainTileState,
  previous: DomainTileState | undefined,
  commandId: string
): OwnershipChangeSample | undefined => {
  if (!previous) return undefined;
  const townLost = Boolean(previous.town) && !tile.town;
  if (previous.ownerId === tile.ownerId && !townLost) return undefined;
  return {
    tileKey,
    x: tile.x,
    y: tile.y,
    previousOwnerId: previous.ownerId,
    nextOwnerId: tile.ownerId,
    commandId,
    hadTown: Boolean(previous.town),
    townLost,
    hadOwnershipState: previous.ownershipState,
    previousTownPopulationTier: previous.town?.populationTier
  };
};
