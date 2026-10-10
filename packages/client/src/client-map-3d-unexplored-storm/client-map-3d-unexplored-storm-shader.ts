// GLSL for client-map-3d-unexplored-storm.ts. Draws on unexplored tiles,
// plus hatching alone on remembered (fogged) tiles -- hatching means "not in
// sight". Tiles in sight are discarded outright, never touched. The fog's coastline lives in the first ring
// of unexplored tiles (those touching explored land, diagonals included):
//   1. A see-through hatched parchment band ("charted coast, not yet
//      surveyed") over the ring tile's ground, from the explored edge out to a rounded, noise-wobbled contour ~0.7-0.85 of
//      the way across the ring tile.
//   2. A brass survey edge on that contour (bright line, darker storm-side
//      edge, rivets at tile edges), with a lit lip on the cloud behind it.
//   3. The storm beyond: drifting cloud masses under straight engraved
//      hatching, with the hidden tile grid faintly showing through.
// The contour is cut from a blurred field of "deep fog" (unexplored tiles
// with no explored neighbour), so it rounds corners instead of following
// tile squares. Tiles' own edges against explored land are anti-aliased
// inward only. All derivatives and texture reads happen before the single
// `discard`.

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
uniform vec3 uBrass;
uniform vec3 uBrassDark;
uniform vec3 uRivet;
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

float maskR(vec2 tile) {
  vec2 uv = (tile + 0.5 - uMaskMin) / uMaskSize;
  return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 1.0 : texture2D(uMask, uv).r;
}

void main() {
  vec2 w = vWorldXZ;
  vec2 drift = vec2(uTime * 0.09, uTime * 0.035);
  float body = fbm(w * 0.17 + drift * 0.17);
  float mass = fbm(w * 0.08 - drift * 0.05 + body * 0.6);
  float edgeNoise = fbm(w * 0.9 + drift * 0.3);

  // R: 1 = unexplored, for this tile and its 4 edge neighbours.
  vec2 tile = floor(vSceneXZ);
  vec2 f = vSceneXZ - tile;
  float hard = maskR(tile);
  vec2 tileUv = (tile + 0.5 - uMaskMin) / uMaskSize;
  float remembered = (tileUv.x < 0.0 || tileUv.y < 0.0 || tileUv.x > 1.0 || tileUv.y > 1.0) ? 0.0 : texture2D(uMask, tileUv).b;
  float l = maskR(tile + vec2(-1.0, 0.0));
  float r = maskR(tile + vec2(1.0, 0.0));
  float u = maskR(tile + vec2(0.0, -1.0));
  float d = maskR(tile + vec2(0.0, 1.0));
  // Inward-only anti-aliasing along edges shared with explored tiles.
  vec2 fwScene = fwidth(vSceneXZ);
  float edgeAa = min(
    min(l > 0.5 ? 1.0 : smoothstep(0.0, fwScene.x, f.x), r > 0.5 ? 1.0 : smoothstep(0.0, fwScene.x, 1.0 - f.x)),
    min(u > 0.5 ? 1.0 : smoothstep(0.0, fwScene.y, f.y), d > 0.5 ? 1.0 : smoothstep(0.0, fwScene.y, 1.0 - f.y))
  );

  // G: deep-fog field. Exactly 1 at a deep tile's centre (it's always
  // storm), lower across the ring; bilinear + a 5-tap average rounds the
  // contour instead of notching or pinching it at tile corners.
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  vec2 uvTile = (tile + 0.5 - uMaskMin) / uMaskSize;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  float deep = outside ? 1.0 : step(0.99, texture2D(uMask, uvTile).g);
  vec2 tap = 0.32 / uMaskSize;
  float soft = outside ? 1.0 : (texture2D(uMask, uv).g * 2.0
    + texture2D(uMask, uv + vec2(tap.x, tap.y)).g + texture2D(uMask, uv + vec2(-tap.x, tap.y)).g
    + texture2D(uMask, uv + vec2(tap.x, -tap.y)).g + texture2D(uMask, uv + vec2(-tap.x, -tap.y)).g) / 6.0;
  float s = soft + edgeNoise * 0.1;
  float sw = clamp(fwidth(s), 0.004, 0.04);

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

  // --- parchment band, across the ring tile from the explored edge ---
  float parchHatch = lines((w.x - w.y) * 2.8, 0.09);
  vec3 parch = mix(uParchment, uParchmentInk, parchHatch * 0.7);
  // Slight shadow under the cloud's leading edge.
  parch *= 1.0 - smoothstep(EDGE - 0.08, EDGE, s) * 0.25;
  float stormCover = max(deep, smoothstep(EDGE - sw, EDGE + sw, s));
  vec3 col = mix(parch, storm, stormCover);
  // The band is see-through: the ring tile's own ground is drawn underneath
  // (client-map-3d-terrain-tile-rules.ts), so it reads as a glimpse of
  // uncharted coast. Even, not faded in from the explored edge -- a clear
  // edge let the ring's ground read as a hole beside explored land.
  float parchAlpha = mix(0.55, 0.7, smoothstep(0.1, 0.4, s));
  float coverAlpha = mix(parchAlpha, 1.0, stormCover);

  // --- brass survey edge on the cloud's edge ---
  // A bright brass line on the contour, a darker brass edge just on the
  // storm side, and rivets where the line crosses a tile edge.
  float dRim = s - EDGE;
  float rimHalf = max(0.012, sw * 1.5);
  float brass = (1.0 - deep) * (1.0 - smoothstep(rimHalf, rimHalf + sw, abs(dRim)));
  float brassEdge = (1.0 - deep) * (1.0 - smoothstep(rimHalf * 0.6, rimHalf * 0.6 + sw, abs(dRim - rimHalf * 1.6)));
  vec2 gridDist = abs(fract(w + 0.5) - 0.5);
  float onGrid = 1.0 - smoothstep(0.035, 0.035 + max(fwScene.x, fwScene.y), min(gridDist.x, gridDist.y));
  float rivet = (1.0 - deep) * onGrid * (1.0 - smoothstep(rimHalf * 1.8, rimHalf * 1.8 + sw, abs(dRim)));
  col = mix(col, uBrassDark, brassEdge * 0.9);
  col = mix(col, uBrass, brass);
  col = mix(col, uRivet, rivet);
  coverAlpha = max(coverAlpha, max(max(brass, brassEdge * 0.9), rivet));

  // Explored tiles get nothing but, when remembered (fogged), the same
  // hatching as the ring: hatching means "not in sight".
  float rememberedHatch = (1.0 - hard) * remembered * parchHatch * 0.55;
  col = mix(uParchmentInk, col, hard);
  float alpha = max(hard * edgeAa * coverAlpha, rememberedHatch);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
