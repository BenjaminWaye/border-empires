import type { PersonalActivityTileFeatureCount } from "@border-empires/game-domain";
import { NATURAL_WONDER_LABELS, structureDisplayName, type NaturalWonderType } from "@border-empires/shared";

import { listNames } from "./client-activity-dashboard-names.js";

const AFC_NAME = "Automated Fabrication Complex";

// Names follow "your"/"their" in a list, so a leading article goes: "your
// Titanium Levy", not "your The Titanium Levy".
const withoutArticle = (name: string): string => name.replace(/^the /i, "");

// "Foundry Heart wonder" keeps "your Palisade, Dock and Foundry Heart wonder"
// one phrase. A wonder this client doesn't know (a newer server) falls back
// to its humanized id.
const wonderName = (wonderType: NaturalWonderType): string =>
  `${withoutArticle(NATURAL_WONDER_LABELS[wonderType]?.name ?? structureDisplayName(wonderType))} wonder`;

const featureName = (feature: PersonalActivityTileFeatureCount): string => {
  if (feature.kind === "STRUCTURE") return withoutArticle(structureDisplayName(feature.structureType));
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

type FeatureOwner = "your" | "their" | undefined;

const ownedList = (list: string, owner: FeatureOwner): string => `${owner ? `${owner} ` : ""}${list}`;

/** "incl. your Palisade and Dock" -- a row part naming what stood on the tiles it counts. */
export const featuresPart = (features: readonly PersonalActivityTileFeatureCount[] | undefined, owner: FeatureOwner): string | undefined => {
  const list = featureListLabel(features);
  return list ? `incl. ${ownedList(list, owner)}` : undefined;
};

/**
 * " (incl. your Palisade and Dock)" appended straight after the clause it
 * belongs to, so it never reads as part of a neighbouring one. "with" suits a
 * single tile ("Lost a tile to Maren (with your Dock)"), "incl." a count of
 * tiles. Empty when there is nothing to name.
 */
export const featuresNote = (
  features: readonly PersonalActivityTileFeatureCount[] | undefined,
  owner: FeatureOwner,
  lead: "with" | "incl.",
  alreadyNamed?: string
): string => {
  const list = featureListLabel(features, alreadyNamed);
  return list ? ` (${lead} ${ownedList(list, owner)})` : "";
};
