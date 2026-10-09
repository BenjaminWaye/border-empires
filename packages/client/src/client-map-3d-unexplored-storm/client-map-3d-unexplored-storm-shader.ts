// GLSL for client-map-3d-unexplored-storm.ts. Layers, outermost first:
//   1. Parchment band over explored land near the fog: terrain washed toward
//      old-map parchment and cross-hatched, fading out ~0.8 tile in.
//   2. A thin shadow, then a pale foam rim along a noise-wobbled contour
//      ~0.2-0.35 tile inside explored land -- the cloud's leading edge,
//      with a lit lip just behind it.
//   3. The storm: drifting cloud masses under straight engraved hatching,
//      with the hidden tile grid faintly showing through.
// Every unexplored tile is forced fully opaque (mask R), so the band and rim
// only ever eat into explored tiles and never expose the void.
// All derivatives are taken before the single `discard` at the end.

export const STORM_VERTEX_SHADER = `
varying vec2 vSceneXZ;
varying vec2 vWorldXZ;
uniform vec2 uWorldOrigin;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSceneXZ = wp.xz;
  vWorldXZ = wp.xz + uWorldOrigin;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const STORM_FRAGMENT_SHADER = `
varying vec2 vSceneXZ;
varying vec2 vWorldXZ;
uniform float uTime;
uniform vec3 uDark;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uInk;
uniform vec3 uParchment;
uniform vec3 uParchmentInk;
uniform vec3 uFoam;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v / 0.9375;
}
// Thin anti-aliased line on every integer of x; fades once lines would
// crowd closer than a few pixels.
float lines(float x, float halfWidth) {
  float d = abs(fract(x + 0.5) - 0.5);
  float fw = fwidth(x);
  float l = 1.0 - smoothstep(halfWidth, halfWidth + fw * 1.2, d);
  return l * clamp(1.6 - fw * 5.0, 0.0, 1.0);
}

const float EDGE = 0.47;

void main() {
  vec2 w = vWorldXZ;
  vec2 drift = vec2(uTime * 0.09, uTime * 0.035);
  float body = fbm(w * 0.17 + drift * 0.17);
  float mass = fbm(w * 0.08 - drift * 0.05 + body * 0.6);
  float edgeNoise = fbm(w * 0.9 + drift * 0.3);

  // Mask: outside the built window nothing is drawn, so it's all storm.
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  vec2 uvTile = (floor(vSceneXZ) + 0.5 - uMaskMin) / uMaskSize;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  float hard = outside ? 1.0 : texture2D(uMask, uvTile).r;
  // 5-tap average rounds the diamond-shaped bilinear contours, which would
  // otherwise pinch a lone explored tile poking into the fog into a spike.
  vec2 tap = 0.32 / uMaskSize;
  float soft = outside ? 1.0 : (texture2D(uMask, uv).g * 2.0
    + texture2D(uMask, uv + vec2(tap.x, tap.y)).g + texture2D(uMask, uv + vec2(-tap.x, tap.y)).g
    + texture2D(uMask, uv + vec2(tap.x, -tap.y)).g + texture2D(uMask, uv + vec2(-tap.x, -tap.y)).g) / 6.0;
  float s = soft + edgeNoise * 0.1;
  float sw = max(fwidth(s), 0.004);

  // --- storm ---
  float density = smoothstep(0.32, 0.72, (body + mass) * 0.5);
  vec3 storm = mix(uLight, uDark, density);
  float bright = smoothstep(0.62, 0.85, body) * (1.0 - density);
  storm = mix(storm, uLight * 1.12, bright * 0.6);
  storm *= 0.97 + hash(floor(w)) * 0.06;
  float grid = max(lines(w.x, 0.012), lines(w.y, 0.012));
  storm = mix(storm, uInk, grid * (0.32 - density * 0.14));
  // Engraved hatching: straight, ~3 lines per tile, gathering under the
  // dense cloud and thinning out in the lighter breaks, sliding slowly like
  // falling rain.
  float hatchCoord = (w.x - w.y) * 2.8 - uTime * 0.25;
  float hatch = lines(hatchCoord, 0.06 + density * 0.14);
  storm = mix(storm, uInk, hatch * (0.06 + smoothstep(0.25, 0.85, density) * 0.6));
  // Lit lip just inside the cloud's edge, so the bank reads as having a top.
  float lip = 1.0 - smoothstep(EDGE, EDGE + 0.14, s);
  storm = mix(storm, uLight * 1.2, lip * 0.6);

  // --- parchment band on explored land ---
  float parchHatch = lines((w.x - w.y) * 2.8, 0.09);
  vec3 parch = mix(uParchment, uParchmentInk, parchHatch * 0.7);
  float parchAlpha = smoothstep(0.05, 0.22, s) * 0.78;
  // Slight shadow under the cloud's leading edge.
  parch *= 1.0 - smoothstep(EDGE - 0.08, EDGE, s) * 0.25;

  float stormCover = max(hard, smoothstep(EDGE - sw, EDGE + sw, s));
  vec3 col = mix(parch, storm, stormCover);
  float alpha = max(stormCover, parchAlpha);

  // --- foam rim on the cloud's edge ---
  float rimHalf = max(0.012, sw * 1.5);
  float rim = (1.0 - hard) * (1.0 - smoothstep(rimHalf, rimHalf + sw, abs(s - EDGE - 0.012)));
  col = mix(col, uFoam, rim * 0.9);
  alpha = max(alpha, rim * 0.9);

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
