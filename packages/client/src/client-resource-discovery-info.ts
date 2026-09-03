// "Resource revealed" info for the tech detail panel: when a tech's
// effects.revealResource marks it as the tech that reveals a strategic
// resource, players who haven't found it yet need to know what it looks
// like (glyph/color, matching the map/HUD) and roughly where to look.
// Deliberately reuses the glyph/color already defined for the map/HUD
// (resourceIconForKey/strategicResourceColor in client-map-display.ts) and
// the "what it's for" copy already written for the map-discovery toast
// (DISCOVERY_TIPS in client-discovery-tips/client-discovery-tips.ts) instead
// of duplicating either, so this panel can't drift out of sync with what the
// map itself shows.
import { resourceColor, resourceIconForKey, resourceLabel } from "./client-map-display.js";
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
// deposit key; resourceIconForKey takes the strategic-resource key.
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
    glyph: resourceIconForKey(key),
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

// "Resource revealed" card: glyph/color swatch + what it's for + where to
// find it, for the strategic resource this tech reveals. Reuses the same
// structure-info-* classes as the structure-info overlay so this reads as
// part of the same design system instead of a one-off card.
export const renderResourceRevealHtml = (tech: TechInfo): string => {
  const resources = relatedStrategicResourcesForTech(tech);
  if (resources.length === 0) return "";
  const cardsHtml = resources
    .map((key) => {
      const info = resourceDiscoveryInfo(key);
      return `<div class="structure-info-meta-card resource-reveal-card">
        <div class="resource-reveal-swatch" style="background:${info.color}22;color:${info.color}" aria-hidden="true">${info.glyph}</div>
        <div class="resource-reveal-copy">
          <strong>${info.label}</strong>
          <span>${info.whatItsFor}</span>
          <span class="muted">${info.whereToFind}</span>
        </div>
      </div>`;
    })
    .join("");
  return `<section class="structure-info-section">
    <span class="structure-info-section-label">Resource revealed</span>
    <div class="resource-reveal-list">${cardsHtml}</div>
  </section>`;
};
