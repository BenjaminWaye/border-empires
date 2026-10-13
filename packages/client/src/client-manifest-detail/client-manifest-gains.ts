// "What you get" for one Manifest: every structure, ability, revealed
// resource and passive effect it grants, one row each. Replaces the old
// detail card's four overlapping sections (highlight chips, Structures,
// Abilities & actions, Resource revealed) that listed the same unlocks two
// or three times.
import { AGRICULTURE_FISH_FOOD_SLOT_BONUS } from "@border-empires/shared";
import { structureArtIconHtml } from "../client-build-menu-icons/client-build-menu-icons.js";
import { crystalAbilityGlyphForKey, crystalAbilityInfoButtonHtml, relatedCrystalAbilitiesForTech } from "../client-crystal-ability-info/client-crystal-ability-info.js";
import { effectSummaryLabel } from "../client-tech-html/client-tech-html.js";
import { relatedStructureTypesForTech } from "../client-tech-detail-ui/client-tech-structure-unlocks.js";
import { relatedStrategicResourcesForTech, resourceDiscoveryInfo } from "../client-resource-discovery-info.js";
import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import { MONUMENT_COMPONENT_KEYS, STRUCTURE_DISPLAY_NAMES, type StructureInfoKey } from "../client-map-display.js";
import type { TechInfo } from "../client-types.js";

export type ManifestGainKind = "structure" | "ability" | "resource" | "effect";

export type ManifestGainRow = {
  kind: ManifestGainKind;
  // Trusted HTML: the row's icon (building art, ability glyph, resource icon).
  icon: string;
  // Trusted HTML built from catalog data and the shared info-button helpers.
  html: string;
  detail?: string;
};

export type ManifestGainDeps = {
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
  structureDetail?: (type: StructureInfoKey) => string | undefined;
};

// U+FE0E asks for the text form of glyphs like ⚡ that otherwise render as
// colour emoji, so ability glyphs take the panel's brass colour.
const glyphIcon = (glyph: string): string => `<span class="manifest-gain__glyph">${glyph}\uFE0E</span>`;

// Buildings show their own map art (the build menu's thumbnails); the few
// without art fall back to a generic hammer glyph.
const structureIcon = (type: StructureInfoKey): string => structureArtIconHtml(type, "manifest-gain__art") ?? glyphIcon("⚒");

const firstSentence = (text: string | undefined): string | undefined => {
  if (!text) return undefined;
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return match?.[1] ?? text.trim();
};

// Effect keys already shown as a structure/ability/resource row; the generic
// effect-summary row would only repeat them ("Unlocks forts"). Coverage is
// derived from the same mappers that build those rows, so an unlock key that
// neither mapper knows still falls through to its effect-summary line.
const isCoveredUnlockKey = (key: string, value: unknown): boolean => {
  if (key === "revealResource") return true;
  if (value !== true) return false;
  const single = { effects: { [key]: true } };
  return relatedStructureTypesForTech(single).length > 0 || relatedCrystalAbilitiesForTech(single).length > 0;
};

export const manifestGainRows = (tech: TechInfo, deps: ManifestGainDeps): ManifestGainRow[] => {
  const rows: ManifestGainRow[] = [];
  for (const type of relatedStructureTypesForTech(tech)) {
    if (MONUMENT_COMPONENT_KEYS.has(type)) continue;
    const detail = firstSentence(deps.structureDetail?.(type));
    rows.push({ kind: "structure", icon: structureIcon(type), html: `Build ${deps.structureInfoButtonHtml(type)}`, ...(detail ? { detail } : {}) });
  }
  for (const key of relatedCrystalAbilitiesForTech(tech)) {
    rows.push({ kind: "ability", icon: glyphIcon(crystalAbilityGlyphForKey(key)), html: `Ability: ${crystalAbilityInfoButtonHtml(key)}` });
  }
  for (const resource of relatedStrategicResourcesForTech(tech)) {
    const label = resource.charAt(0) + resource.slice(1).toLowerCase();
    rows.push({ kind: "resource", icon: resourceIconHtml(resource), html: `Reveals ${label} deposits on the map`, detail: resourceDiscoveryInfo(resource).whereToFind });
  }
  const effectIcon = glyphIcon("+");
  for (const [key, value] of Object.entries(tech.effects ?? {})) {
    if (isCoveredUnlockKey(key, value)) continue;
    const label = effectSummaryLabel(key, value);
    if (label) rows.push({ kind: "effect", icon: effectIcon, html: label });
  }
  // Hydrogarden's structure row covers the building; its fish-tile bonus is a
  // separate passive effect of the same unlock key.
  if (tech.effects?.unlockHydrogarden === true) rows.push({ kind: "effect", icon: effectIcon, html: `+${AGRICULTURE_FISH_FOOD_SLOT_BONUS} FOOD slot on every owned fish tile` });
  if (tech.grantsPowerup) rows.push({ kind: "effect", icon: effectIcon, html: `Powerup: ${tech.grantsPowerup.id} +${tech.grantsPowerup.charges}` });
  return rows;
};

// One-line summary for compact lists (the owned-Manifests chips' tooltip).
export const manifestGainSummary = (tech: TechInfo): string => {
  const rows = manifestGainRows(tech, { structureInfoButtonHtml: (type, label) => label ?? STRUCTURE_DISPLAY_NAMES[type] ?? type });
  return rows.map((row) => row.html.replace(/<[^>]+>/g, "")).join(" · ");
};
