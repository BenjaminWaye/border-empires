// Display names for the per-category auto-garrison switches (shared
// auto-settle-prefs.ts), shared by the Settings card and the tile-menu checkbox.
import { RESOURCE_NETWORKS, type AutoSettleCategory, type ResourceType } from "@border-empires/shared";

const BASE_RESOURCE_LABELS: Record<"FARM" | "FISH" | "TITANIUM" | "UMBRITE" | "GEMS", string> = {
  FARM: "Farm",
  FISH: "Fish",
  TITANIUM: "Titanium",
  UMBRITE: "Umbrite",
  GEMS: "Crystal"
};

/** "Titanium", "Precursor salvage", … (towns keeps its own label). */
export const autoSettleCategoryLabel = (category: AutoSettleCategory): string => {
  if (category === "towns") return "Towns & docks";
  const resource: ResourceType = category;
  return resource in BASE_RESOURCE_LABELS
    ? BASE_RESOURCE_LABELS[resource as keyof typeof BASE_RESOURCE_LABELS]
    : RESOURCE_NETWORKS[resource as keyof typeof RESOURCE_NETWORKS].name;
};

/** Which settings-panel group a category is listed under. */
export const autoSettleCategoryGroup = (category: AutoSettleCategory): "Towns" | "Food" | "Strategic resources" | "Luxury resources" => {
  if (category === "towns") return "Towns";
  if (category === "FARM" || category === "FISH") return "Food";
  if (category === "TITANIUM" || category === "UMBRITE" || category === "GEMS") return "Strategic resources";
  return "Luxury resources";
};
