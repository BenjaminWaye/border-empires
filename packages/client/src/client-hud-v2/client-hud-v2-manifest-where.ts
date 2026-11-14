// Where a Manifest's unlocks are used, said on its detail bar. A newcomer
// commissioned Hyperfeed Seedstock for its Hydrogarden and then searched every
// town build menu for it: a Hydrogarden is built on a grain tile, not in a
// town (2026-11-14 playtest). And "Reveal Titanium" showed nothing, because it
// only marks deposits in land you have explored.
import { structurePlacementMetadata, type StructurePlacementMetadata, type StructurePlacementType } from "@border-empires/shared";
import { resourceLabel, STRUCTURE_DISPLAY_NAMES } from "../client-map-display.js";

const resourceNames = (resources: readonly string[]): string =>
  resources.map((r) => resourceLabel(r).toLowerCase()).join(" or ");

/** "Hydrogarden: build on a garrisoned grain tile" — undefined when the structure has no placement entry. */
export const structureBuildWhere = (type: string): string | undefined => {
  // The lookup is a plain record read: a structure with no placement entry (a monument, say) gives undefined.
  const meta: StructurePlacementMetadata | undefined = structurePlacementMetadata(type as StructurePlacementType);
  if (!meta) return undefined;
  const name = STRUCTURE_DISPLAY_NAMES[type as keyof typeof STRUCTURE_DISPLAY_NAMES] ?? type;
  const { showOn } = meta;
  if (meta.resourceTypes && meta.resourceTypes.length > 0 && showOn.length === 1) return `${name}: build on a garrisoned ${resourceNames(meta.resourceTypes)} tile`;
  if (showOn.length === 1 && showOn[0] === "dock") return `${name}: build on a dock you hold`;
  if ((showOn.includes("town") || showOn.includes("support")) && !showOn.includes("settled")) return `${name}: build from a town's Build tab`;
  return `${name}: build on a garrisoned tile`;
};

/** The reveal line: what Reveal does and where to look. */
export const revealWhere = (resource: string): string =>
  `Reveal ${resource.charAt(0)}${resource.slice(1).toLowerCase()}: marks deposits in land you have explored, in the Resources lens`;
