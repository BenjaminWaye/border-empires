// GLSL for the terrain surface pass in client-map-3d-heightfield-shader.ts:
// the noise helpers and the layers that sit on top of the painted biome
// textures. Kept apart so the patch file stays about *where* things splice
// into three.js's shader, and this one about *what* the ground looks like.
//
// Everything here is keyed on continuous world coordinates (vTerrainWorldUv,
// one unit per tile), never on floor(tile), so nothing it draws can line up
// with the tile grid. The old per-tile 90° texture rotation did, and showed
// as a checkerboard of hard tile-sized squares across every field.

// Distance (in world tiles per screen pixel) past which the fine grain
// layer has fully faded out; finer than this it would only shimmer.
const GRAIN_FADE_START = 0.04;
const GRAIN_FADE_END = 0.12;

// Water surface sits at -0.06 (client-map-3d-water-surface.ts) and a coast
// corner is pinned to -0.04 (COAST_EDGE_Y); sand tiles rest at 0.07. The wet
// band covers the lower part of that bevel, just above the waterline.
const WET_SAND_TOP_Y = 0.045;
const WET_SAND_FULL_Y = -0.01;

// World-normal Y below which a slope starts showing bare earth/rock. Flat
// ground is 1.0; a coast bevel ~0.98; hill flanks reach ~0.7.
const SLOPE_ROCK_START = 0.9;
const SLOPE_ROCK_FULL = 0.68;

// Bump heights in world units. The rolling term (a few tiles across) gives
// flat fields soft sunlit/shaded undulation without moving any geometry --
// gameplay height stays exactly what the heightfield says; the grain term
// is close-up micro relief and fades out with terrainGrainFade.
const BUMP_ROLLING_HEIGHT = 0.7;
const BUMP_GRAIN_HEIGHT = 0.02;

const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Declared at fragment scope (after #include <common>).
export const TERRAIN_NOISE_GLSL = `
float terrainHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float terrainValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = terrainHash(i);
  float b = terrainHash(i + vec2(1.0, 0.0));
  float c = terrainHash(i + vec2(0.0, 1.0));
  float d = terrainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float terrainFbm(vec2 p) {
  return terrainValueNoise(p) * 0.5
    + terrainValueNoise(p * 2.03 + 17.1) * 0.3
    + terrainValueNoise(p * 4.11 + 41.7) * 0.2;
}
// Two decorrelated reads of one painted texture -- the tiled one (8 tiles
// per repeat) and a rotated, larger-scale one -- picked between by a
// few-tile-wide noise mask. Mostly one or the other (the narrow smoothstep),
// so the blend zones are short and organic rather than a constant 50/50
// average that would flatten the painted contrast.
vec3 terrainSampleBiome(sampler2D tex, vec2 worldUv, float layerMask) {
  vec3 tiled = texture2D(tex, worldUv * 0.125).rgb;
  vec2 rotatedUv = mat2(0.8, -0.6, 0.6, 0.8) * worldUv * 0.0763 + vec2(0.37, 0.71);
  vec3 rotated = texture2D(tex, rotatedUv).rgb;
  return mix(tiled, rotated, layerMask);
}
// Bump-mapped normal from a scalar height field, via screen-space
// derivatives (the same construction as three.js's perturbNormalArb, which
// only exists in the shader under USE_BUMPMAP).
vec3 terrainPerturbNormal(vec3 surfPos, vec3 surfNorm, float height, float faceDir) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

// Runs inside the replaced <map_fragment>, before the biome blend. Sets
// terrainBumpHeight (declared before #ifdef USE_MAP so the normal patch can
// read it) and defines terrainLayerMask (for terrainSampleBiome), terrainMacro/terrainMeso
// (large/medium world noise) and terrainGrain (fine, distance-faded).
export const TERRAIN_SURFACE_NOISE_GLSL = `
      float terrainLayerMask = smoothstep(0.38, 0.62, terrainValueNoise(vTerrainWorldUv * 0.31 + 7.3));
      float terrainMacro = terrainFbm(vTerrainWorldUv * 0.055);
      float terrainMeso = terrainValueNoise(vTerrainWorldUv * 0.21 + 3.1);
      float terrainPixelTiles = length(fwidth(vTerrainWorldUv));
      float terrainGrainFade = 1.0 - smoothstep(${glslFloat(GRAIN_FADE_START)}, ${glslFloat(GRAIN_FADE_END)}, terrainPixelTiles);
      float terrainGrain = (terrainValueNoise(vTerrainWorldUv * 7.0) * 0.6
        + terrainValueNoise(vTerrainWorldUv * 15.0 + 5.0) * 0.4 - 0.5) * terrainGrainFade;
      terrainBumpHeight = terrainMeso * ${glslFloat(BUMP_ROLLING_HEIGHT)} + terrainGrain * ${glslFloat(BUMP_GRAIN_HEIGHT)};`;

// Runs after the biome/snow/rock blend. Expects grassMask, tundraMask,
// biomeColor and the noise values above in scope; writes terrainWetMask
// (declared before #ifdef USE_MAP so the roughness patch can read it).
export const TERRAIN_SURFACE_LAYERS_GLSL = `
      // Macro variation: sun-dried golden patches vs lush hollows across a
      // field, plus a medium-scale brightness wander, so a large meadow
      // reads as land rather than one repeated swatch.
      vec3 terrainDry = vec3(1.1, 1.03, 0.8);
      vec3 terrainLush = vec3(0.86, 1.0, 0.88);
      vec3 terrainGrassTint = mix(terrainDry, terrainLush, smoothstep(0.3, 0.7, terrainMacro));
      float terrainBareMask = grassMask * (1.0 - tundraMask);
      biomeColor *= mix(vec3(1.0), terrainGrassTint, 0.55 * terrainBareMask);
      biomeColor *= 0.93 + 0.14 * terrainMeso;

      // Slopes: exposed earth/rock on steep hill flanks, broken up by noise
      // so it reads as eroded ground, not a contour band.
      vec3 terrainWorldNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
      float terrainSlope = smoothstep(${glslFloat(SLOPE_ROCK_START)}, ${glslFloat(SLOPE_ROCK_FULL)}, abs(terrainWorldNormal.y));
      terrainSlope *= smoothstep(0.25, 0.6, terrainMeso + terrainMacro * 0.5);
      float terrainLum = dot(biomeColor, vec3(0.299, 0.587, 0.114));
      vec3 terrainEarth = vec3(0.52, 0.45, 0.36) * (0.75 + 0.5 * terrainLum);
      biomeColor = mix(biomeColor, terrainEarth, terrainSlope * 0.75);

      // Wet shoreline: the bevel just above the waterline darkens and goes
      // glossy (see the roughness patch), like sand the surf just left.
      terrainWetMask = smoothstep(${glslFloat(WET_SAND_TOP_Y)}, ${glslFloat(WET_SAND_FULL_Y)}, vTerrainWorldY);
      biomeColor *= mix(vec3(1.0), vec3(0.62, 0.66, 0.7), terrainWetMask);

      // Fine grain: close-up crispness the 64px-per-tile painted textures
      // can't resolve on their own. Fades out before it would alias.
      biomeColor *= 1.0 + terrainGrain * 0.22;`;

// Appended after <normal_fragment_maps>.
export const TERRAIN_BUMP_NORMAL_GLSL = `
normal = terrainPerturbNormal(-vViewPosition, normal, terrainBumpHeight, faceDirection);`;

// Appended after <roughnessmap_fragment>.
export const TERRAIN_WET_ROUGHNESS_GLSL = `
roughnessFactor = mix(roughnessFactor, 0.38, terrainWetMask);`;
