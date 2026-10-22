import type { PersonalActivityTileFeatureCount } from "@border-empires/game-domain";
import { NATURAL_WONDER_LABELS, structureDisplayName, type NaturalWonderType } from "@border-empires/shared";

import { listNames } from "./client-activity-dashboard-names.js";

const AFC_NAME = "Automated Fabrication Complex";

// "the Foundry Heart" reads as a place, not a thing you lost: "Foundry Heart
// wonder" keeps "your Palisade, Dock and Foundry Heart wonder" one phrase.
// A wonder this client doesn't know (a newer server) falls back to its humanized id.
const wonderName = (wonderType: NaturalWonderType): string => {
  const label = NATURAL_WONDER_LABELS[wonderType]?.name ?? structureDisplayName(wonderType);
  return `${label.replace(/^the /i, "")} wonder`;
};

const featureName = (feature: PersonalActivityTileFeatureCount): string => {
  if (feature.kind === "STRUCTURE") return structureDisplayName(feature.structureType);
  if (feature.kind === "DOCK") return "Dock";
  if (feature.kind === "AFC") return AFC_NAME;
  if (feature.kind === "NATURAL_WONDER") return wonderName(feature.wonderType);
  // A feature kind from a newer server than this client.
  return "landmark";
};

/**
 * "Palisade ×2, Dock and Foundry Heart wonder", or undefined when nothing is
 * left to name. `alreadyNamed` is a structure the sentence names itself (a
 * card's defenseVariant, as in "Your Palisade fell"), dropped once here so it
 * isn't repeated.
 */
export const featureListLabel = (features: readonly PersonalActivityTileFeatureCount[] | undefined, alreadyNamed?: string): string | undefined => {
  const names: string[] = [];
  let skipped = false;
  for (const feature of features ?? []) {
    let count = feature.count;
    if (!skipped && alreadyNamed && feature.kind === "STRUCTURE" && feature.structureType === alreadyNamed) {
      skipped = true;
      count -= 1;
    }
    if (count > 0) names.push(count === 1 ? featureName(feature) : `${featureName(feature)} ×${count}`);
  }
  return names.length > 0 ? listNames(names) : undefined;
};

/** "incl. your Palisade and Dock" / "incl. their Dock" -- the card part naming what fell with the tiles. */
export const featuresPart = (
  features: readonly PersonalActivityTileFeatureCount[] | undefined,
  owner: "your" | "their" | undefined,
  alreadyNamed?: string
): string | undefined => {
  const list = featureListLabel(features, alreadyNamed);
  return list ? `incl. ${owner ? `${owner} ` : ""}${list}` : undefined;
};
