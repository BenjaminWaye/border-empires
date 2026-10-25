import { isDistrictBuilding, isDistrictProject, type DistrictVisualKind } from "../client-town-district/district-catalog.js";
import type { StructureInfoKey } from "../client-map-display.js";

export type GenericReviewKind = "HYDROGARDEN" | "MINE" | "HARBOR_EXCHANGE";
export type StructureOverlayRoute =
  | { readonly family: "district"; readonly kind: DistrictVisualKind }
  | { readonly family: "relay"; readonly kind: "RELAY_BEACON" }
  | { readonly family: "aether-tower"; readonly kind: "OBSERVATORY" }
  | { readonly family: "fort"; readonly kind: "PALISADE" | "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "SIEGE_BATTERY" }
  | { readonly family: "siege-tower"; readonly kind: "SIEGE_TOWER" | "DREAD_TOWER" }
  | { readonly family: "umbrite-rig"; readonly kind: "UMBRITE_RIG" }
  | { readonly family: "generic"; readonly kind: GenericReviewKind };

// Mirrors live tile dispatch: forts and siege towers have dedicated overlays;
// the district kit supersedes old generic support art. No name-based guessing.
export const structureOverlayRoute = (kind: StructureInfoKey): StructureOverlayRoute => {
  if (isDistrictBuilding(kind) || isDistrictProject(kind)) return { family: "district", kind };
  switch (kind) {
    case "RELAY_BEACON": return { family: "relay", kind };
    case "OBSERVATORY": return { family: "aether-tower", kind };
    case "PALISADE": case "FORT": case "TITANIUM_BASTION": case "THUNDER_BASTION": case "SIEGE_BATTERY": return { family: "fort", kind };
    case "SIEGE_TOWER": case "DREAD_TOWER": return { family: "siege-tower", kind };
    case "UMBRITE_RIG": return { family: "umbrite-rig", kind };
    default: return { family: "generic", kind };
  }
};
