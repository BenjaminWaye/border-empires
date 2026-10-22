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
// corner is pinned to -0.04 (COAST_EDGE_Y); sand tiles rest at 0.07, so a
// one-tile beach is that bevel almost end to end. The wet band must stay a
// thin lip right at the waterline -- an earlier 0.045 top covered most of
// a narrow beach and turned it grey-brown. WET_SAND_EDGE_WOBBLE lets the
// band's top edge wander with the meso noise so it isn't a contour line.
const WET_SAND_TOP_Y = -0.005;
const WET_SAND_FULL_Y = -0.035;
const WET_SAND_EDGE_WOBBLE = 0.012;

// World-normal Y below which a slope starts showing bare earth/rock. Flat
// ground is 1.0 and a coast bevel ~0.98; a hill's eased-out rim stays above
// 0.8 so it blends into the meadow instead of being outlined in brown --
// only genuinely steep faces get earth.
const SLOPE_ROCK_START = 0.8;
const SLOPE_ROCK_FULL = 0.6;

// Bump heights in world units. The rolling term (a few tiles across) gives
// flat fields soft sunlit/shaded undulation without moving any geometry --
// gameplay height stays exactly what the heightfield says; the grain term
// is close-up micro relief and fades out with terrainGrainFade.
const BUMP_ROLLING_HEIGHT = 0.7;
const BUMP_GRAIN_HEIGHT = 0.02;

// Grass colour grade (see TERRAIN_SURFACE_LAYERS_GLSL).
const GRASS_SATURATION = 1.3;
const GRASS_HUE_SHIFT: readonly [number, number, number] = [0.92, 1.04, 0.96];

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
// How far the grass/sand threshold shifts at this pixel: brighter grass
// texels (clump tops) hold out further into the sand, darker gaps give way
// to it first, and two noise scales wander the line so it never follows
// the tile grid. Zero-mean (0.67 is the grass texture's average) and at
// most ~0.035 either way: pure sand sits at greenBias ~0.036 and pure
// grass ~0.19, so with the 0.07-0.13 cut neither ever picks up the other's
// texture -- a larger swing pulled green into the sand and turned whole
// beaches khaki.
float terrainBiomeEdgeOffset(vec3 grassSample, float meso, float grain) {
  float clump = dot(grassSample, vec3(0.333)) - 0.67;
  return clump * 0.06 + (meso - 0.5) * 0.03 + grain * 0.03;
}
// Same idea for the tundra edge, on its explicit 0..1 corner mask.
float terrainTundraEdgeOffset(float meso, float grain) {
  return (meso - 0.5) * 0.16 + grain * 0.12;
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
      vec3 terrainDry = vec3(1.06, 1.03, 0.86);
      vec3 terrainLush = vec3(0.84, 1.0, 0.9);
      vec3 terrainGrassTint = mix(terrainDry, terrainLush, smoothstep(0.3, 0.7, terrainMacro));
      float terrainBareMask = grassMask * (1.0 - tundraMask);
      biomeColor *= mix(vec3(1.0), terrainGrassTint, 0.55 * terrainBareMask);

      // Grass grade: the painted meadow is a yellow-green, and the filmic
      // tone curve darkens and desaturates mid greens, so at game zoom
      // fields read olive. More saturation and a nudge from yellow toward
      // green (luminance kept) gives a fresh, rich meadow. Multiplicative,
      // so the 12% vertex hue tint below still separates plains, jungle
      // and marsh from grassland.
      float terrainGrassLum = dot(biomeColor, vec3(0.2126, 0.7152, 0.0722));
      vec3 terrainGraded = mix(vec3(terrainGrassLum), biomeColor, ${glslFloat(GRASS_SATURATION)}) * vec3(${GRASS_HUE_SHIFT.map(glslFloat).join(", ")});
      biomeColor = mix(biomeColor, max(terrainGraded, vec3(0.0)), terrainBareMask);
      // Brightness wander is mostly a meadow thing; on sand it reads as dirt.
      biomeColor *= mix(1.0, 0.93 + 0.14 * terrainMeso, mix(0.35, 1.0, grassMask));

      // Slopes: exposed earth/rock on steep hill flanks, broken up by noise
      // so it reads as eroded ground, not a contour band.
      vec3 terrainWorldNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
      float terrainSlope = smoothstep(${glslFloat(SLOPE_ROCK_START)}, ${glslFloat(SLOPE_ROCK_FULL)}, abs(terrainWorldNormal.y));
      terrainSlope *= smoothstep(0.25, 0.6, terrainMeso + terrainMacro * 0.5);
      float terrainLum = dot(biomeColor, vec3(0.299, 0.587, 0.114));
      vec3 terrainEarth = vec3(0.52, 0.45, 0.36) * (0.75 + 0.5 * terrainLum);
      biomeColor = mix(biomeColor, terrainEarth, terrainSlope * 0.75);

      // Tundra: ochre lichen mats and scattered frost-shattered stones break
      // up the pale permafrost; snow gets faint wind-drift streaks, bright
      // on the crests and cool blue in the troughs.
      float terrainTundraBare = tundraMask * (1.0 - snowMask);
      float terrainLichen = smoothstep(0.45, 0.75, terrainFbm(vTerrainWorldUv * 0.6 + 21.0));
      biomeColor = mix(biomeColor, biomeColor * vec3(1.14, 1.0, 0.66), terrainLichen * 0.85 * terrainTundraBare);
      float terrainStone = smoothstep(0.85, 0.9, terrainValueNoise(vTerrainWorldUv * 3.3 + 9.0));
      vec3 terrainStoneColor = vec3(0.7, 0.7, 0.69) * (0.9 + terrainGrain * 0.6);
      biomeColor = mix(biomeColor, terrainStoneColor, terrainStone * 0.6 * terrainTundraBare);
      float terrainDrift = terrainValueNoise(vec2(vTerrainWorldUv.x * 0.7, vTerrainWorldUv.y * 3.2) + 5.0);
      biomeColor *= mix(vec3(1.0), mix(vec3(0.9, 0.95, 1.04), vec3(1.05), smoothstep(0.3, 0.7, terrainDrift)), snowMask);

      // Wet shoreline: the bevel just above the waterline darkens and goes
      // glossy (see the roughness patch), like sand the surf just left.
      float terrainWetTop = ${glslFloat(WET_SAND_TOP_Y)} + (terrainMeso - 0.5) * ${glslFloat(WET_SAND_EDGE_WOBBLE)};
      terrainWetMask = smoothstep(terrainWetTop, ${glslFloat(WET_SAND_FULL_Y)}, vTerrainWorldY);
      biomeColor *= mix(vec3(1.0), vec3(0.82, 0.78, 0.7), terrainWetMask);

      // Fine grain: close-up crispness the 64px-per-tile painted textures
      // can't resolve on their own. Fades out before it would alias. Kept
      // light on sand, where the same speckle reads as dirt.
      biomeColor *= 1.0 + terrainGrain * mix(0.08, 0.22, grassMask);`;

// Appended after <normal_fragment_maps>.
export const TERRAIN_BUMP_NORMAL_GLSL = `
normal = terrainPerturbNormal(-vViewPosition, normal, terrainBumpHeight, faceDirection);`;

// Appended after <roughnessmap_fragment>.
export const TERRAIN_WET_ROUGHNESS_GLSL = `
roughnessFactor = mix(roughnessFactor, 0.6, terrainWetMask);`;
