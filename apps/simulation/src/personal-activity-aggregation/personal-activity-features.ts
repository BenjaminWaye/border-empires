import type { PersonalActivityTileFeature, PersonalActivityTileFeatureCount } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { featureSurvivesCapture } from "../territory-flip-log/territory-flip-features.js";

type FeaturesByCombat = ReadonlyMap<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>;

// What stood on the tiles a fight changed hands, read off its matched flips
// (personal-activity-flip-matching.ts).
export type CombatTileFeatures = {
  /** The target of each capture. */
  captured: FeaturesByCombat;
  /** The launch tile of each failed attack that the defender seized. */
  seizedOrigin: FeaturesByCombat;
};

export const NO_COMBAT_TILE_FEATURES: CombatTileFeatures = { captured: new Map(), seizedOrigin: new Map() };

const featureKey = (feature: PersonalActivityTileFeature): string =>
  feature.kind === "STRUCTURE" ? `STRUCTURE:${feature.structureType}` : feature.kind === "NATURAL_WONDER" ? `NATURAL_WONDER:${feature.wonderType}` : feature.kind;

/**
 * Counts features by kind, in first-seen order. A card's list is therefore
 * bounded by the number of distinct structure/wonder kinds, however many
 * tiles a long push took.
 */
export const countTileFeatures = (features: Iterable<PersonalActivityTileFeature>): PersonalActivityTileFeatureCount[] => {
  const counts = new Map<string, PersonalActivityTileFeatureCount>();
  for (const feature of features) {
    const key = featureKey(feature);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { ...feature, count: 1 });
  }
  return [...counts.values()];
};

/** The counts, or undefined when there is nothing to report, so a bare card leaves its optional field off the wire. */
export const nonEmptyFeatureCounts = (features: Iterable<PersonalActivityTileFeature>): PersonalActivityTileFeatureCount[] | undefined => {
  const counts = countTileFeatures(features);
  return counts.length > 0 ? counts : undefined;
};

/**
 * Counts as one viewer sees them: the player who lost the tile lost
 * everything on it; the player who took it only gets what survives capture
 * (a razed Relay Beacon is not "captured").
 */
export const viewerFeatureCounts = (features: readonly PersonalActivityTileFeature[] | undefined, viewerTookTile: boolean): PersonalActivityTileFeatureCount[] | undefined =>
  nonEmptyFeatureCounts((features ?? []).filter((feature) => !viewerTookTile || featureSurvivesCapture(feature)));
