// Keeps forest instances out of v9 river banks. Tree layouts reach up to
// ~0.36 tile from a tile's centre (client-map-3d-forest.ts LAYOUTS), i.e.
// within ~0.14 of its border -- where a border river's trench and water now
// sit -- so trees used to stand in the river. v1-v8 seasons have no edge
// rivers, so this never filters anything there.
import { riverEdgeKey, riverEdgeKeysForCurrentSeed } from "@border-empires/shared";
import { RIVER_BANK_REACH } from "./client-map-3d-rivers-channel.js";

/**
 * Predicate for one tile: true when a tree at offset (ox, oz) from the
 * tile's centre stands inside the bank of a river on one of the tile's
 * borders. Null when the tile has no river edges (the common case), so
 * callers skip the per-tree check entirely.
 */
export const riverBankTreeFilter = (
  worldX: number,
  worldZ: number,
  edges: ReadonlySet<number> = riverEdgeKeysForCurrentSeed()
): ((ox: number, oz: number) => boolean) | null => {
  if (edges.size === 0) return null;
  const top = edges.has(riverEdgeKey(worldX, worldZ, "H"));
  const bottom = edges.has(riverEdgeKey(worldX, worldZ + 1, "H"));
  const left = edges.has(riverEdgeKey(worldX, worldZ, "V"));
  const right = edges.has(riverEdgeKey(worldX + 1, worldZ, "V"));
  if (!top && !bottom && !left && !right) return null;
  const limit = 0.5 - RIVER_BANK_REACH;
  return (ox, oz) => (top && oz < -limit) || (bottom && oz > limit) || (left && ox < -limit) || (right && ox > limit);
};
