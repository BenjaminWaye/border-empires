// Steampunk art for the tile menu's Buildings tab: the five category squares
// use PNGs from public/icons/build-categories, and each building row shows
// that building's own map art (public/overlays) in place of its glyph.

import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { buildMenuArtUrl } from "../client-structure-art/client-structure-art.js";
import { structureTypeForTileAction } from "../client-tile-action-support/client-tile-action-support.js";
import type { TileActionDef } from "../client-types.js";
import { BUILD_MENU_ART_CROP, type ArtCropBox } from "./client-build-menu-art-crop.js";

const categoryIconUrl = (category: BuildingCategory, px: 48 | 72 | 96): string =>
  `/icons/build-categories/${category}-${px}.png`;

export const buildingCategoryIconHtml = (category: BuildingCategory): string => {
  const src = (px: 48 | 72 | 96): string => categoryIconUrl(category, px);
  return `<img class="tile-building-category-art" src="${src(48)}" srcset="${src(48)} 1x, ${src(72)} 1.5x, ${src(96)} 2x" alt="" aria-hidden="true" draggable="false">`;
};

// Actions structureTypeForTileAction doesn't resolve to the building they
// produce: upgrades show the Advanced building, the frontier beacon is the
// same Relay Beacon.
const ART_STRUCTURE_FOR_ACTION: Partial<Record<TileActionDef["id"], string>> = {
  upgrade_titanium_works: "HIGH_YIELD_TITANIUM_WORKS",
  upgrade_aether_condenser: "HIGH_YIELD_AETHER_CONDENSER",
  upgrade_umbrite_works: "HIGH_YIELD_UMBRITE_WORKS",
  build_relay_beacon_frontier: "RELAY_BEACON"
};

// Undefined when the action builds nothing or the building has no art yet;
// the caller then keeps the glyph.
export const buildActionArtUrl = (actionId: TileActionDef["id"]): string | undefined => {
  const structureType = ART_STRUCTURE_FOR_ACTION[actionId] ?? structureTypeForTileAction(actionId);
  return structureType ? buildMenuArtUrl(structureType) : undefined;
};

const pct = (value: number): string => `${+(value * 100).toFixed(2)}%`;

// Positions the full SVG inside a square slot so the crop box is scaled to fit
// and centred; the slot clips the rest.
const croppedImgStyle = ([x, y, width, height]: ArtCropBox): string => {
  const scale = 1 / Math.max(width, height);
  const left = -x * scale + (1 - width * scale) / 2;
  const top = -y * scale + (1 - height * scale) / 2;
  return `width:${pct(scale)};height:${pct(scale)};left:${pct(left)};top:${pct(top)}`;
};

// The art cropped into a square slot; slotClass sizes the slot and clips it.
const croppedArtHtml = (url: string, slotClass: string): string => {
  const crop = BUILD_MENU_ART_CROP[url];
  const style = crop ? ` style="${croppedImgStyle(crop)}"` : "";
  return `<span class="${slotClass}"><img src="${url}"${style} alt="" aria-hidden="true" draggable="false" loading="lazy"></span>`;
};

export const buildActionIconHtml = (actionId: TileActionDef["id"]): string | undefined => {
  const url = buildActionArtUrl(actionId);
  return url ? croppedArtHtml(url, "tile-action-art") : undefined;
};

// Same thumbnail keyed by structure type, for views that list buildings
// rather than build actions (the Manifest detail's "What you get" rows).
export const structureArtIconHtml = (structureType: string, slotClass: string): string | undefined => {
  const url = buildMenuArtUrl(structureType);
  return url ? croppedArtHtml(url, slotClass) : undefined;
};
