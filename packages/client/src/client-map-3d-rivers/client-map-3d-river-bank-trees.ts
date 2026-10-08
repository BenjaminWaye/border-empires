// Keeps forest instances out of v9 river banks. Tree layouts reach up to
// ~0.36 tile from a tile's centre (client-map-3d-forest.ts LAYOUTS), i.e.
// within ~0.14 of its border -- where a border river's trench and water now
// sit -- so trees used to stand in the river. v1-v8 seasons have no edge
// rivers, so this never filters anything there.
import { riverEdgeKey, riverEdgeKeysForCurrentSeed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { RIVER_BANK_REACH } from "./client-map-3d-rivers-channel.js";
import { COVE_RADIUS } from "./client-map-3d-river-edge-water.js";
import { riverMouthCorners } from "./client-map-3d-river-mouths.js";

// Trees also keep out of the cove cut at a river mouth (the land there drops
// below the sea; a tree placed at the tile's ground height would float).
const COVE_TREE_CLEARANCE = COVE_RADIUS + 0.05;

// This runs per forest tile per rebuild: resolve the mouth corners once per
// seed (keyed on the per-seed edge set) instead of per call.
let mouthsForEdges: { readonly edges: ReadonlySet<number>; readonly mouths: ReadonlySet<number> } | null = null;
const mouthCornersFor = (edges: ReadonlySet<number>): ReadonlySet<number> => {
  if (mouthsForEdges?.edges !== edges) mouthsForEdges = { edges, mouths: riverMouthCorners() };
  return mouthsForEdges.mouths;
};

/**
 * Predicate for one tile: true when a tree at offset (ox, oz) from the
 * tile's centre stands inside the bank of a river on one of the tile's
 * borders, or inside the cove at a river mouth on one of its corners. Null
 * when neither applies (the common case), so callers skip the per-tree
 * check entirely.
 */
export const riverBankTreeFilter = (
  worldX: number,
  worldZ: number,
  edges: ReadonlySet<number> = riverEdgeKeysForCurrentSeed(),
  mouthsOverride?: ReadonlySet<number>
): ((ox: number, oz: number) => boolean) | null => {
  if (edges.size === 0) return null;
  const mouths = mouthsOverride ?? mouthCornersFor(edges);
  const top = edges.has(riverEdgeKey(worldX, worldZ, "H"));
  const bottom = edges.has(riverEdgeKey(worldX, worldZ + 1, "H"));
  const left = edges.has(riverEdgeKey(worldX, worldZ, "V"));
  const right = edges.has(riverEdgeKey(worldX + 1, worldZ, "V"));
  // Tile corners (offsets from the tile centre) where a river meets the sea.
  const coves: (readonly [number, number])[] = [];
  for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const key = ((worldZ + cz) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT * WORLD_WIDTH + ((worldX + cx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
    if (mouths.has(key)) coves.push([cx - 0.5, cz - 0.5]);
  }
  if (!top && !bottom && !left && !right && coves.length === 0) return null;
  const limit = 0.5 - RIVER_BANK_REACH;
  return (ox, oz) =>
    (top && oz < -limit) || (bottom && oz > limit) || (left && ox < -limit) || (right && ox > limit) ||
    coves.some(([cx, cz]) => Math.hypot(ox - cx, oz - cz) < COVE_TREE_CLEARANCE);
};
