import { HYDROWORKS_RADIUS } from "@border-empires/game-domain";
import { WORLD_WIDTH, WORLD_HEIGHT, structurePlacementMetadata, structureShowsOnTile, type BuildableStructureType, type ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const tileResource = (resource: string | undefined): ResourceType | undefined => {
  switch (resource) {
    case "FARM": case "FISH": case "TITANIUM": case "GEMS": case "UMBRITE": return resource;
    default: return undefined;
  }
};

const withinHydroworksRange = (a: Tile, b: Tile): boolean => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy)) <= HYDROWORKS_RADIUS;
};

// Use the same resource/surface restrictions as the build menu. Only known,
// owned, unoccupied sites count; an undiscovered Farm cannot justify a badge.
export const hasManifestBuildSite = (type: BuildableStructureType, ownedTiles: readonly Tile[]): boolean => {
  const metadata = structurePlacementMetadata(type);
  // Summaries cannot establish support-ring caps or border eligibility.
  // Do not promise construction until those rules can be verified too.
  if (metadata.requiresBorder || metadata.placementMode !== "same_tile") return false;
  const hydroworks = type === "HYDROWORKS"
    ? ownedTiles.filter((tile) => tile.economicStructure?.type === "HYDROWORKS" && tile.economicStructure.status === "active")
    : [];
  const hydrogardens = type === "HYDROWORKS"
    ? ownedTiles.filter((tile) => tile.ownershipState === "SETTLED" && tile.economicStructure?.type === "HYDROGARDEN" &&
      tile.economicStructure.status === "active" && !hydroworks.some((booster) => withinHydroworksRange(tile, booster)))
    : [];
  if (type === "HYDROWORKS" && hydrogardens.length === 0) return false;
  return ownedTiles.some((tile) => {
    if (tile.fogged || tile.terrain !== "LAND" || tile.siegeBattery || tile.observatory || tile.economicStructure) return false;
    if (tile.ownershipState !== "SETTLED") return false;
    if (type === "HYDROWORKS" && !hydrogardens.some((beneficiary) => withinHydroworksRange(tile, beneficiary))) return false;
    const townTier = tile.town?.populationTier ?? tile.townPopulationTier;
    return structureShowsOnTile(type, {
      ownershipState: tile.ownershipState,
      resource: tileResource(tile.resource),
      dockId: tile.dockId,
      townPopulationTier: townTier === "SETTLEMENT" ? undefined : townTier
    });
  });
};
