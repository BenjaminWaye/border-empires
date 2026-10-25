import type { DomainTileState, PersonalActivityTileFeature } from "@border-empires/game-domain";
import { defendingFortVariant } from "@border-empires/shared";

// A structure still being built never stood on the tile yet; anything past
// that (active, inactive, being removed) did, and was lost with the land.
const isBuilt = (status: string): boolean => status !== "under_construction";

/**
 * What stood on `tile` just before it changed hands, recorded on its
 * TerritoryFlip so the personal timeline can say "your Palisade and Dock
 * fell" rather than only "−2 tiles lost". A fort counts while it stands: an
 * active or being-removed fort, or, mid-upgrade, the tier it is upgrading
 * from (defendingFortVariant). The same forts capturedStructureFields hands
 * to the captor. Towns and docks are left out -- their capture already has
 * its own TOWN_* / DOCK_* impact card, so naming them here would report the
 * same loss twice on the timeline.
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
  if (tile.naturalWonder) features.push({ kind: "NATURAL_WONDER", wonderType: tile.naturalWonder.type, ...(tile.naturalWonder.relicVersion === 1 ? { relicVersion: 1 } : {}) });
  return features;
};

// Razed rather than handed over on capture (capturedStructureFields in
// capture-structures.ts): siege batteries and relay beacons. Kept in step
// with that rule by territory-flip-features.test.ts.
const RAZED_ON_CAPTURE: ReadonlySet<string> = new Set(["SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER", "RELAY_BEACON"]);

/**
 * Whether the player who takes the tile actually gets this feature. The
 * loser lost it either way; the captor's report only names what it now owns.
 */
export const featureSurvivesCapture = (feature: PersonalActivityTileFeature): boolean =>
  feature.kind !== "STRUCTURE" || !RAZED_ON_CAPTURE.has(feature.structureType);

/** `{ features }` for a TerritoryFlip, or nothing when the tile was bare -- keeps the log entry small. */
export const flipFeatures = (tile: DomainTileState | undefined): { features?: PersonalActivityTileFeature[] } => {
  const features = tileFeaturesForActivity(tile);
  return features.length > 0 ? { features } : {};
};
