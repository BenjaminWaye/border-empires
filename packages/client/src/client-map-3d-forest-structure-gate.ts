// A built economic structure replaces a forest tile's trees, both in the
// true-3D renderer (this gate) and the 2D canvas renderer (the structure
// sprite simply paints over the tile). Pulled out as a pure function so the
// rule is unit-testable without spinning up the full 3D render loop.
import type { Tile } from "./client-types.js";

export const shouldDrawForestInstance = (forestTile: boolean, tile: Tile | undefined): boolean =>
  forestTile && !tile?.economicStructure;

// Same structure-replaces-trees rule as shouldDrawForestInstance above,
// applied to the purely decorative light-grass scatter sapling (see
// isLightGrassScatterTile in client-constants.ts) instead of a real forest
// tile.
export const shouldDrawLightGrassScatterInstance = (lightGrassScatterTile: boolean, tile: Tile | undefined): boolean =>
  lightGrassScatterTile && !tile?.economicStructure;
