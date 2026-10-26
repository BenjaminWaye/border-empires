// GLSL for the beach layers in client-map-3d-heightfield-shader.ts: a
// feathered grass/sand edge and a thin damp band at the waterline. Kept
// apart so the patch file stays about *where* things splice into three.js's
// shader, and this one about *what* the beach looks like.
//
// Everything here is keyed on continuous world coordinates (vTerrainWorldUv,
// one unit per tile), never on floor(tile), so neither edge can line up
// with the tile grid.

// Distance (in world tiles per screen pixel) past which the fine wobble on
// the grass/sand edge has fully faded out; finer than this it would shimmer.
const GRAIN_FADE_START = 0.04;
const GRAIN_FADE_END = 0.12;

// Water surface sits at -0.06 (client-map-3d-water-surface.ts) and a coast
// corner is pinned to -0.04 (COAST_EDGE_Y). The shore sand fringe
// (client-map-3d-shore-sand.ts) carries the beach out from the land's coast
// edge down to just above the water (-0.052), so the band sits on that
// fringe's outer lip. Any higher and it tints most of a narrow beach, which
// reads as brown patches. WET_SAND_EDGE_WOBBLE lets the band's top edge
// wander with noise so it isn't a contour line.
const WET_SAND_TOP_Y = -0.046;
const WET_SAND_FULL_Y = -0.053;
const WET_SAND_EDGE_WOBBLE = 0.003;

const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Declared at fragment scope (after #include <common>).
export const BEACH_NOISE_GLSL = `
float beachHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float beachValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = beachHash(i);
  float b = beachHash(i + vec2(1.0, 0.0));
  float c = beachHash(i + vec2(0.0, 1.0));
  float d = beachHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

// Runs inside the replaced <map_fragment>, after the grass/sand samples.
// Defines beachMeso (few-tile world noise) and grassMask. The grass/sand
// threshold is pushed around by the grass texture's own light/dark detail
// (read continuously here, not through the per-tile rotation, so the shift
// never jumps at a tile edge) and by two noise scales, so sand shows
// through the gaps between grass clumps for a soft, organic edge. Zero-mean
// (0.67 is the grass texture's average) and at most ~0.035 either way: pure
// sand sits at greenBias ~0.036 and pure grass ~0.19, so with the 0.07-0.13
// cut neither ever picks up the other's texture -- a larger swing pulled
// green into the sand and turned whole beaches khaki.
export const BEACH_GRASS_EDGE_GLSL = `
      float beachMeso = beachValueNoise(vTerrainWorldUv * 0.21 + 3.1);
      float beachPixelTiles = length(fwidth(vTerrainWorldUv));
      float beachGrainFade = 1.0 - smoothstep(${glslFloat(GRAIN_FADE_START)}, ${glslFloat(GRAIN_FADE_END)}, beachPixelTiles);
      float beachGrain = (beachValueNoise(vTerrainWorldUv * 7.0) * 0.6
        + beachValueNoise(vTerrainWorldUv * 15.0 + 5.0) * 0.4 - 0.5) * beachGrainFade;
      float beachClump = dot(texture2D(map, vTerrainWorldUv * 0.125).rgb, vec3(0.333)) - 0.67;
      float beachEdgeOffset = beachClump * 0.06 + (beachMeso - 0.5) * 0.03 + beachGrain * 0.03;
      float grassMask = smoothstep(0.07, 0.13, greenBias + beachEdgeOffset);`;

// Runs after the biome blend; writes beachWetMask (declared before
// #ifdef USE_MAP so the roughness patch can read it). The bevel just above
// the waterline darkens and goes glossy, like sand the surf just left.
export const BEACH_WET_SAND_GLSL = `
      float beachWetTop = ${glslFloat(WET_SAND_TOP_Y)} + (beachMeso - 0.5) * ${glslFloat(WET_SAND_EDGE_WOBBLE)};
      beachWetMask = smoothstep(beachWetTop, ${glslFloat(WET_SAND_FULL_Y)}, vTerrainWorldY);
      biomeColor *= mix(vec3(1.0), vec3(0.82, 0.78, 0.7), beachWetMask);`;

// Appended after <roughnessmap_fragment>.
export const BEACH_WET_ROUGHNESS_GLSL = `
roughnessFactor = mix(roughnessFactor, 0.6, beachWetMask);`;
