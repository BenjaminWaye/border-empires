// "Resource revealed" info for the tech detail panel: when a tech's
// effects.revealResource marks it as the tech that reveals a strategic
// resource, players who haven't found it yet need to know what it looks
// like (glyph/color, matching the map/HUD) and roughly where to look.
// Deliberately reuses the glyph/color already defined for the map/HUD
// (resourceIconHtml in client-resource-icons.ts, resourceColor in
// client-map-display.ts) and
// the "what it's for" copy already written for the map-discovery toast
// (DISCOVERY_TIPS in client-discovery-tips/client-discovery-tips.ts) instead
// of duplicating either, so this panel can't drift out of sync with what the
// map itself shows.
import { resourceColor, resourceLabel } from "./client-map-display.js";
import { resourceIconHtml } from "./client-resource-icons/client-resource-icons.js";
import { DISCOVERY_TIPS, type DiscoveryTipId } from "./client-discovery-tips/client-discovery-tips.js";
import type { TechInfo } from "./client-types.js";

export type StrategicResourceKey = "TITANIUM" | "CRYSTAL" | "UMBRITE";

export type ResourceDiscoveryInfo = {
  key: StrategicResourceKey;
  label: string;
  glyph: string;
  color: string;
  whatItsFor: string;
  whereToFind: string;
};

const DISCOVERY_TIP_ID_BY_RESOURCE: Record<StrategicResourceKey, DiscoveryTipId> = {
  TITANIUM: "TITANIUM",
  CRYSTAL: "CRYSTAL",
  UMBRITE: "UMBRITE"
};

const WHERE_TO_FIND: Record<StrategicResourceKey, string> = {
  TITANIUM: "Titanium is found near mountains.",
  CRYSTAL: "Crystal is found in deserts (Sand terrain).",
  UMBRITE: "Umbrite is found in large quantities in dense forests, and in smaller scattered veins in hilly deserts."
};

// Map's raw deposit key (GEMS) differs from the strategic-resource key used
// by tech requirements/HUD (CRYSTAL) — mirrors strategicResourceKeyForTile
// in client-map-display.ts. resourceColor/resourceLabel take the raw
// deposit key; resourceIconHtml takes the strategic-resource key.
const MAP_RESOURCE_KEY_BY_STRATEGIC: Record<StrategicResourceKey, string> = {
  TITANIUM: "TITANIUM",
  CRYSTAL: "GEMS",
  UMBRITE: "UMBRITE"
};

export const resourceDiscoveryInfo = (key: StrategicResourceKey): ResourceDiscoveryInfo => {
  const mapKey = MAP_RESOURCE_KEY_BY_STRATEGIC[key];
  return {
    key,
    label: resourceLabel(mapKey),
    glyph: resourceIconHtml(key, "large"),
    color: resourceColor(mapKey) ?? "#888",
    whatItsFor: DISCOVERY_TIPS[DISCOVERY_TIP_ID_BY_RESOURCE[key]].body,
    whereToFind: WHERE_TO_FIND[key]
  };
};

// Strategic resource a tech reveals, per effects.revealResource (a lowercase
// category string — "titanium"/"crystal"/"umbrite"/"food" — set on exactly
// the tech that unlocks that resource; see client-tech-payoffs.ts, which
// already turns this into a "Reveals X" highlight tag). This, not a
// resource cost (no tech actually costs a strategic resource — cost is
// gold-only per packages/game-domain/data/tech-tree.json), is what should
// trigger the "Resource revealed" card below.
export const relatedStrategicResourcesForTech = (tech: TechInfo): StrategicResourceKey[] => {
  const revealed = typeof tech.effects?.revealResource === "string" ? tech.effects.revealResource.toUpperCase() : undefined;
  return (["TITANIUM", "CRYSTAL", "UMBRITE"] as const).filter((key) => key === revealed);
};
