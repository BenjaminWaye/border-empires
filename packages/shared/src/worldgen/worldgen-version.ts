// Split out so worldgen.ts (already at the repo's 500-line file cap) doesn't
// grow. Bump CURRENT_WORLDGEN_VERSION when a worldgen algorithm change
// (region/hill/biome noise, thresholds) would alter output for an EXISTING
// seed. New seasons stamp this into SimulationSeasonState.worldgenVersion at
// creation; setWorldSeed's 3rd arg (in worldgen.ts) must be re-passed with
// that stamped value on every resume/render (server AND client) so an
// already-running season keeps reproducing whatever version it was generated
// under, instead of silently picking up "latest" and drifting mid-game --
// see the terrain-variation-blob writeup in the PR that added this.
export const CURRENT_WORLDGEN_VERSION = 10; // v10: separate continents get a rift seaway between them instead of fusing into one supercontinent, continents-style mountain ranges wander/segment instead of running ruler-straight along plate boundaries, and atolls stay round instead of being stretched by the domain warp (worldgen-mountain-ranges.ts, worldgen-continent-score.ts). v9: v8 + rivers along tile edges (worldgen-rivers-edge.ts), GRASSLAND/bright PLAINS split, lake-only MARSH (worldgen-visual-biome.ts)

let state = 1; // default = pre-versioning legacy behavior (matches setWorldSeed's own default)

export const setWorldgenVersionState = (version: number): void => {
  state = version;
};

export const worldgenVersion = (): number => state;

// Gate for the v10 shape fixes above. Older seasons keep their stamped
// version, so they keep regenerating the exact geometry they were played on.
export const NATURAL_RANGE_SHAPE_MIN_WORLDGEN_VERSION = 10;
export const naturalRangeShapeActive = (): boolean => state >= NATURAL_RANGE_SHAPE_MIN_WORLDGEN_VERSION;
export const continentSeparationActive = (): boolean => state >= NATURAL_RANGE_SHAPE_MIN_WORLDGEN_VERSION;
