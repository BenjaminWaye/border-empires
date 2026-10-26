// GLSL for the beach layer in client-map-3d-heightfield-shader.ts: a thin
// damp band at the waterline. Kept apart so the patch file stays about
// *where* things splice into three.js's shader, and this one about *what*
// the beach looks like.
//
// The grass/sand cut itself stays develop's (greenBias 0.055-0.085). A
// feathered, noise-driven edge was tried here and dropped: grass-family
// biomes span greenBias ~0.07 (mountain foot) to ~0.31, the mountain foot
// sits right on the cut, and nothing local tells a grass/sand transition
// from a grass/mountain-foot one -- every variant either turned marsh,
// legacy plains or mountain foot sandy, or broke at the beach fringe's
// seam with the land.

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
  // Wrapped first: on world coords scaled up for fine noise (x ~640 * 15)
  // p * 456.21 runs past float precision and the hash collapses into
  // coarse, patterned steps toward the east of the map.
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
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

// Runs after the biome blend; writes beachWetMask (declared before
// #ifdef USE_MAP so the roughness patch can read it). The bevel just above
// the waterline darkens and goes glossy, like sand the surf just left.
export const BEACH_WET_SAND_GLSL = `
      float beachMeso = beachValueNoise(vTerrainWorldUv * 0.21 + 3.1);
      float beachWetTop = ${glslFloat(WET_SAND_TOP_Y)} + (beachMeso - 0.5) * ${glslFloat(WET_SAND_EDGE_WOBBLE)};
      beachWetMask = smoothstep(beachWetTop, ${glslFloat(WET_SAND_FULL_Y)}, vTerrainWorldY);
      biomeColor *= mix(vec3(1.0), vec3(0.82, 0.78, 0.7), beachWetMask);`;

// Appended after <roughnessmap_fragment>.
export const BEACH_WET_ROUGHNESS_GLSL = `
roughnessFactor = mix(roughnessFactor, 0.6, beachWetMask);`;
