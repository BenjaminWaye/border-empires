// Split out so worldgen.ts (already at the repo's 500-line file cap) doesn't
// grow. Bump CURRENT_WORLDGEN_VERSION when a worldgen algorithm change
// (region/hill/biome noise, thresholds) would alter output for an EXISTING
// seed. New seasons stamp this into SimulationSeasonState.worldgenVersion at
// creation; setWorldSeed's 3rd arg (in worldgen.ts) must be re-passed with
// that stamped value on every resume/render (server AND client) so an
// already-running season keeps reproducing whatever version it was generated
// under, instead of silently picking up "latest" and drifting mid-game --
// see the terrain-variation-blob writeup in the PR that added this.
export const CURRENT_WORLDGEN_VERSION = 2; // v2: shrunk region wavelengths + 2nd hills clearing pass

let state = 1; // default = pre-versioning legacy behavior (matches setWorldSeed's own default)

export const setWorldgenVersionState = (version: number): void => {
  state = version;
};

export const worldgenVersion = (): number => state;
