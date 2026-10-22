import type { DomainTileState, PersonalActivityTileFeature } from "@border-empires/game-domain";
import { defendingFortVariant } from "@border-empires/shared";

// A structure still being built never stood on the tile yet; anything past
// that (active, inactive, being removed) did, and was lost with the land.
const isBuilt = (status: string): boolean => status !== "under_construction";

/**
 * What stood on `tile` just before it changed hands, recorded on its
 * TerritoryFlip so the personal timeline can say "your Palisade and Dock
 * fell" rather than only "−2 tiles lost". The fort uses the same reading as
 * combat (defendingFortVariant): an active fort, or the one still standing
 * while it upgrades. Towns are left out -- their capture already has its own
 * TOWN_CAPTURED / TOWN_LOST impact card.
 */
export const tileFeaturesForActivity = (tile: DomainTileState | undefined): PersonalActivityTileFeature[] => {
  if (!tile) return [];
  const features: PersonalActivityTileFeature[] = [];
  const fort = tile.fort;
  const fortVariant = fort?.status === "active" || fort?.status === "removing" ? fort.variant ?? "FORT" : defendingFortVariant(fort);
  if (fortVariant) features.push({ kind: "STRUCTURE", structureType: fortVariant });
  if (tile.siegeBattery && isBuilt(tile.siegeBattery.status)) features.push({ kind: "STRUCTURE", structureType: tile.siegeBattery.variant ?? "SIEGE_BATTERY" });
  if (tile.observatory && isBuilt(tile.observatory.status)) features.push({ kind: "STRUCTURE", structureType: "OBSERVATORY" });
  if (tile.economicStructure && isBuilt(tile.economicStructure.status)) features.push({ kind: "STRUCTURE", structureType: tile.economicStructure.type });
  if (tile.afc) features.push({ kind: "AFC" });
  if (tile.dockId) features.push({ kind: "DOCK" });
  if (tile.naturalWonder) features.push({ kind: "NATURAL_WONDER", wonderType: tile.naturalWonder.type });
  return features;
};

/** `{ features }` for a TerritoryFlip, or nothing when the tile was bare -- keeps the log entry small. */
export const flipFeatures = (tile: DomainTileState | undefined): { features?: PersonalActivityTileFeature[] } => {
  const features = tileFeaturesForActivity(tile);
  return features.length > 0 ? { features } : {};
};
