// GLSL shared by the unexplored storm (client-map-3d-unexplored-storm-shader.ts)
// and the clip patched into the natural features under it
// (client-map-3d-unexplored-storm-clip.ts), so both cut the fog's contour at
// the same place: value noise, the contour level, and the blurred deep-fog
// field read from the mask's G channel.

export const STORM_FIELD_GLSL = `
float stormHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stormNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(stormHash(i), stormHash(i + vec2(1.0, 0.0)), u.x), mix(stormHash(i + vec2(0.0, 1.0)), stormHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float stormFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * stormNoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v / 0.9375;
}

// Contour level in the deep-fog field: ~0.2-0.35 tile into a ring tile, so
// the shroud covers most of it and leaves only a glimpse of its ground.
const float STORM_EDGE = 0.24;

// The deep-fog field at mask uv: bilinear + a 5-tap average, which rounds
// the contour instead of notching or pinching it at tile corners.
float stormSoftField(sampler2D mask, vec2 uv, vec2 maskSize) {
  vec2 tap = 0.32 / maskSize;
  return (texture2D(mask, uv).g * 2.0
    + texture2D(mask, uv + vec2(tap.x, tap.y)).g + texture2D(mask, uv + vec2(-tap.x, tap.y)).g
    + texture2D(mask, uv + vec2(tap.x, -tap.y)).g + texture2D(mask, uv + vec2(-tap.x, -tap.y)).g) / 6.0;
}

// The contour's wobble, in world coords drifting with the clouds.
float stormEdgeNoise(vec2 worldXZ, float time) {
  return stormFbm(worldXZ * 0.9 + vec2(time * 0.09, time * 0.035) * 0.3);
}
`;
