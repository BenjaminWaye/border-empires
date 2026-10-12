// Resource / built-structure overlay sprite selection for the 2D canvas
// renderer. Extracted from client-map-render.ts (which is already over the
// 500-line cap) so adding new resource overlays doesn't grow that file — see
// AGENTS.md's file-size discipline. Re-exported from client-map-render so
// existing importers keep working unchanged.
import { createOverlayVariantSet } from "./client-map-overlay-images.js";
import type { Tile } from "../client-types.js";

const builtResourceOverlayVariants = {
  FARM_HYDROPONIC: createOverlayVariantSet(["farm-hydroponic-overlay-1.svg", "farm-hydroponic-overlay-2.svg", "farm-hydroponic-overlay-3.svg"]),
  FARM_FARMSTEAD: createOverlayVariantSet(["farm-farmstead-overlay-1.svg", "farm-farmstead-overlay-2.svg", "farm-farmstead-overlay-3.svg"]),
  FISH_FARMSTEAD: createOverlayVariantSet(["fish-farmstead-overlay-1.svg", "fish-farmstead-overlay-2.svg", "fish-farmstead-overlay-3.svg"]),
  UMBRITE_RIG: createOverlayVariantSet(["umbrite-rig-overlay-1.svg", "umbrite-rig-overlay-2.svg", "umbrite-rig-overlay-3.svg"]),
  TITANIUM_MINE: createOverlayVariantSet(["titanium-mine-overlay-1.svg", "titanium-mine-overlay-2.svg", "titanium-mine-overlay-3.svg"]),
  GEMS_MINE: createOverlayVariantSet(["gems-mine-overlay-1.svg", "gems-mine-overlay-2.svg", "gems-mine-overlay-3.svg", "gems-mine-overlay-4.svg"])
} as const;
const resourceOverlayVariants = {
  FARM: createOverlayVariantSet(["farm-overlay-1.svg", "farm-overlay-2.svg", "farm-overlay-3.svg"]),
  FISH: createOverlayVariantSet(["fish-overlay-1.svg", "fish-overlay-2.svg", "fish-overlay-3.svg"]),
  UMBRITE: createOverlayVariantSet(["umbrite-overlay-1.svg", "umbrite-overlay-2.svg", "umbrite-overlay-3.svg"]),
  TITANIUM: createOverlayVariantSet(["titanium-overlay-1.svg", "titanium-overlay-2.svg", "titanium-overlay-3.svg"]),
  GEMS: createOverlayVariantSet(["gems-overlay-1.svg", "gems-overlay-2.svg", "gems-overlay-3.svg", "gems-overlay-4.svg"])
} as const;
const shardOverlayVariants = {
  CACHE: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"]),
  FALL: createOverlayVariantSet(["shardfall-overlay-1.svg", "shardfall-overlay-2.svg"])
} as const;

export const overlayVariantIndexAt = (x: number, y: number, count: number): number => {
  const hash = (((x + 1) * 374761393) ^ ((y + 1) * 668265263)) >>> 0;
  return hash % count;
};

export const resourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource) return undefined;
  const variants = resourceOverlayVariants[tile.resource as keyof typeof resourceOverlayVariants];
  if (!variants) return undefined;
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const builtResourceOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.resource || !tile.economicStructure) return undefined;
  const key =
    tile.resource === "FARM" && tile.economicStructure.type === "FARMSTEAD" ? "FARM_HYDROPONIC"
    : tile.resource === "FARM" && tile.economicStructure.type === "WATERWORKS" ? "FARM_FARMSTEAD"
    : tile.resource === "FISH" && (tile.economicStructure.type === "FARMSTEAD" || tile.economicStructure.type === "WATERWORKS") ? "FISH_FARMSTEAD"
    : tile.resource === "UMBRITE" && tile.economicStructure.type === "UMBRITE_RIG" ? "UMBRITE_RIG"
    : tile.resource === "TITANIUM" && tile.economicStructure.type === "MINE" ? "TITANIUM_MINE"
    : tile.resource === "GEMS" && tile.economicStructure.type === "MINE" ? "GEMS_MINE"
    : undefined;
  if (!key) return undefined;
  const variants = builtResourceOverlayVariants[key];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const shardOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.shardSite) return undefined;
  const variants = shardOverlayVariants[tile.shardSite.kind];
  return variants[overlayVariantIndexAt(tile.x, tile.y, variants.length)];
};

export const resourceOverlayScaleForTile = (tile: Tile): number => {
  if (tile.resource === "FISH") return 1.3;
  if (tile.resource === "TITANIUM") return 1.2;
  return 1.08;
};
