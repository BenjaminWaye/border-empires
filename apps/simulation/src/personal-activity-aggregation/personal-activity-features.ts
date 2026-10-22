import type { PersonalActivityTileFeature, PersonalActivityTileFeatureCount } from "@border-empires/game-domain";

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
