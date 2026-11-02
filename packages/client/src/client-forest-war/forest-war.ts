// War in a forest (battle scars, shared war-scars.ts, on a forest tile):
// the beams burn the forest's own trees. Each tree in the tile's layout gets
// a fate -- still standing, or burnt where it stood, sliced through by a beam
// with its burnt top down beside the stump, or burnt down to a stump. More of
// them burn with every battle (the whole stand at the worst), and a tree once
// burnt stays burnt as the scars deepen. Both renderers read the same fates: the 3D forest skips the
// destroyed trees and the forest-war model (client-wreck-models/forest-war-model.ts)
// draws them burnt in their place; the 2D forest does the same per anchor.
import { WAR_SCAR_MAX_LEVEL, liveWarScarLevel } from "@border-empires/shared";
import { LAYOUTS, tileHash } from "../client-map-3d-forest.js";
import type { Tile } from "../client-types.js";

export type TreeFate = "standing" | "charred" | "sliced" | "stump";
export type ForestSpecies = "pine" | "spruce" | "leaf" | "palm";

/** Fate patterns per tile; a tile picks one, so models can be built once and shared. */
export const FOREST_WAR_VARIANTS = 3;

// Share of the trees destroyed at each scar level (index = level).
const DESTROYED_SHARE = [0, 0.4, 0.55, 0.72, 0.88, 1] as const;

const roll = (variant: number, slot: number, salt: number): number => {
  const v = Math.sin((variant + 1) * 91.7 + slot * 37.3 + salt * 11.1) * 43758.5453;
  return v - Math.floor(v);
};

/** What became of tree `slot` at scar `level`, for fate pattern `variant`. */
export const treeFate = (variant: number, level: number, slot: number): TreeFate => {
  const depth = Math.max(0, Math.min(WAR_SCAR_MAX_LEVEL, Math.floor(level)));
  if (depth === 0 || roll(variant, slot, 1) >= DESTROYED_SHARE[depth]!) return "standing";
  const kind = roll(variant, slot, 2);
  return kind < 0.55 ? "charred" : kind < 0.82 ? "sliced" : "stump";
};

/** The forest tile's tree layout and species, as client-map-3d-forest.ts lays them out. */
export const forestLayoutAt = (worldX: number, worldZ: number, tropical: boolean): { layout: number; species: ForestSpecies; variant: number } => ({
  layout: tileHash(worldX, worldZ, 7, LAYOUTS.length),
  species: tropical ? "palm" : (["pine", "spruce", "leaf"] as const)[tileHash(worldX, worldZ, 11, 3)]!,
  variant: tileHash(worldX, worldZ, 53, FOREST_WAR_VARIANTS)
});

/**
 * Which of a forest tile's trees still stand, or undefined when the forest is
 * untouched (no live scars, or the tile is fogged and shows what was last seen).
 */
export const standingTreeFilter = (tile: Pick<Tile, "warScarLevel" | "warScarUntil" | "fogged"> | undefined, worldX: number, worldZ: number, nowEpochMs: number = Date.now()): ((slot: number) => boolean) | undefined => {
  const level = liveWarScarLevel(tile, nowEpochMs);
  if (level <= 0 || tile?.fogged) return undefined;
  const variant = tileHash(worldX, worldZ, 53, FOREST_WAR_VARIANTS);
  return (slot) => treeFate(variant, level, slot) === "standing";
};
