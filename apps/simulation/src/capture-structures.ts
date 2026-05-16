import type { DomainTileState } from "@border-empires/game-domain";

type CapturableStructureFields = Pick<DomainTileState, "fort" | "observatory" | "siegeOutpost" | "economicStructure">;

const capturedFort = (tile: DomainTileState | undefined, nextOwnerId: string): DomainTileState["fort"] => {
  if (!tile?.fort || tile.fort.status === "under_construction") return undefined;
  if (tile.fort.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus: _ignoredPreviousStatus, ...fort } = tile.fort;
    return { ...fort, ownerId: nextOwnerId, status: "active" };
  }
  return { ...tile.fort, ownerId: nextOwnerId };
};

const capturedObservatory = (tile: DomainTileState | undefined, nextOwnerId: string): DomainTileState["observatory"] => {
  if (!tile?.observatory || tile.observatory.status === "under_construction") return undefined;
  if (tile.observatory.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...observatory } = tile.observatory;
    return { ...observatory, ownerId: nextOwnerId, status: previousStatus ?? "active" };
  }
  return { ...tile.observatory, ownerId: nextOwnerId };
};

const capturedEconomicStructure = (tile: DomainTileState | undefined, nextOwnerId: string): DomainTileState["economicStructure"] => {
  if (!tile?.economicStructure || tile.economicStructure.status === "under_construction") return undefined;
  if (tile.economicStructure.status === "removing") {
    const { completesAt: _ignoredCompletesAt, previousStatus, ...economicStructure } = tile.economicStructure;
    return { ...economicStructure, ownerId: nextOwnerId, status: previousStatus ?? "inactive" };
  }
  return { ...tile.economicStructure, ownerId: nextOwnerId };
};

export const capturedStructureFields = (tile: DomainTileState | undefined, nextOwnerId: string): CapturableStructureFields => ({
  fort: capturedFort(tile, nextOwnerId),
  observatory: capturedObservatory(tile, nextOwnerId),
  siegeOutpost: undefined,
  economicStructure: capturedEconomicStructure(tile, nextOwnerId)
});
