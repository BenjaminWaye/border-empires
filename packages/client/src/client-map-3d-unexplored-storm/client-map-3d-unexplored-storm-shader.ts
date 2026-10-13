// GLSL for client-map-3d-unexplored-storm.ts. Draws ONLY on unexplored
// tiles -- tiles in sight and remembered tiles are discarded outright. The
// fog's coastline lives in the first ring of unexplored tiles (those
// touching explored land, diagonals included):
//   1. The ring tile's own ground, left clear (no wash) from the explored
//      edge out to a rounded, noise-wobbled contour only ~0.2-0.35 of the
//      way across -- the shroud covers the rest, Civ-style, leaving a glimpse.
//   2. A brass survey edge on that contour (bright line, darker storm-side
//      edge), with lantern light glowing in the storm
//      behind it.
//   3. The storm beyond: drifting cloud masses under straight engraved
//      rain streaks, with the hidden tile grid faintly showing through.
// When tiles become explored the clouds roll back off them: the mask's
// exploredness eases per tile (client-map-3d-unexplored-storm-reveal.ts), so
// the contour recedes smoothly, with a lantern flash (B) as it parts.
// The contour is cut from a blurred field of "deep fog" (unexplored tiles
// with no explored neighbour), so it rounds corners instead of following
// tile squares. Tiles' own edges against explored land are anti-aliased
// inward only. All derivatives and texture reads happen before the single
// `discard`.

import { STORM_FIELD_GLSL } from "./client-map-3d-unexplored-storm-field-glsl.js";

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
uniform vec3 uBrass;
uniform vec3 uLantern;
uniform vec3 uBrassDark;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;

${STORM_FIELD_GLSL}
// Thin anti-aliased line on every integer of x; fades once lines would
// crowd closer than a few pixels.
float lines(float x, float halfWidth) {
  float d = abs(fract(x + 0.5) - 0.5);
  float fw = fwidth(x);
  float l = 1.0 - smoothstep(halfWidth, halfWidth + fw * 1.2, d);
  return l * clamp(1.6 - fw * 5.0, 0.0, 1.0);
}

float maskR(vec2 tile) {
  vec2 uv = (tile + 0.5 - uMaskMin) / uMaskSize;
  return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 1.0 : texture2D(uMask, uv).r;
}

void main() {
  vec2 w = vWorldXZ;
  vec2 drift = vec2(uTime * 0.09, uTime * 0.035);
  float body = stormFbm(w * 0.17 + drift * 0.17);
  float mass = stormFbm(w * 0.08 - drift * 0.05 + body * 0.6);
  float edgeNoise = stormEdgeNoise(w, uTime);

  // R: 1 = unexplored, for this tile and its 4 edge neighbours.
  vec2 tile = floor(vSceneXZ);
  vec2 f = vSceneXZ - tile;
  // Covered until fully explored: a tile rolling back (R between 0 and 1)
  // keeps its cloud, and the contour below pulls back over it smoothly.
  float hard = step(0.002, maskR(tile));
  float l = maskR(tile + vec2(-1.0, 0.0));
  float r = maskR(tile + vec2(1.0, 0.0));
  float u = maskR(tile + vec2(0.0, -1.0));
  float d = maskR(tile + vec2(0.0, 1.0));
  // Inward-only anti-aliasing along edges shared with explored tiles.
  vec2 fwScene = fwidth(vSceneXZ);
  // Eased by the neighbour's exploredness (1 - R), so it fades in while a
  // neighbour rolls back instead of switching on at once.
  float edgeAa = min(
    min(mix(smoothstep(0.0, fwScene.x, f.x), 1.0, l), mix(smoothstep(0.0, fwScene.x, 1.0 - f.x), 1.0, r)),
    min(mix(smoothstep(0.0, fwScene.y, f.y), 1.0, u), mix(smoothstep(0.0, fwScene.y, 1.0 - f.y), 1.0, d))
  );

  // G: deep-fog field. Exactly 1 at a deep tile's centre (it's always
  // storm), lower across the ring; bilinear + a 5-tap average rounds the
  // contour instead of notching or pinching it at tile corners.
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  vec2 uvTile = (tile + 0.5 - uMaskMin) / uMaskSize;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  float deep = outside ? 1.0 : smoothstep(0.97, 0.995, texture2D(uMask, uvTile).g);
  float soft = outside ? 1.0 : stormSoftField(uMask, uv, uMaskSize);
  // Reveal (client-map-3d-unexplored-storm-reveal.ts): a newly explored
  // tile's R eases from 1 to 0, which shrinks the deep-fog field and pulls the
  // clearance in around it, so the contour, brass edge and lantern glow roll
  // back smoothly -- nothing here is per-tile. B is its lantern flash.
  float revealFront = outside ? 0.0 : texture2D(uMask, uv).b;
  float clearance = stormExploredDistance(uMask, uMaskMin, uMaskSize, vSceneXZ);
  float s = stormClearanceField(soft + edgeNoise * 0.1, clearance);
  float sw = clamp(fwidth(s), 0.004, 0.04);

  // --- storm ---
  float density = smoothstep(0.32, 0.72, (body + mass) * 0.5);
  vec3 storm = mix(uLight, uDark, density);
  float bright = smoothstep(0.62, 0.85, body) * (1.0 - density);
  storm = mix(storm, uLight * 1.12, bright * 0.6);
  storm *= 0.97 + stormHash(floor(w)) * 0.06;
  float grid = max(lines(w.x, 0.012), lines(w.y, 0.012));
  storm = mix(storm, uInk, grid * (0.32 - density * 0.14));
  // Rain: fine straight streaks, ~3 per tile, sliding slowly. Kept faint
  // and thin -- heavier, wider strokes read as diagonal hatching stripes
  // across the whole fog at normal play zoom.
  float hatchCoord = (w.x - w.y) * 2.8 - uTime * 0.25;
  float hatch = lines(hatchCoord, 0.04);
  storm = mix(storm, uInk, hatch * (0.03 + smoothstep(0.25, 0.85, density) * 0.12));
  // Lit lip just inside the cloud's edge, so the bank reads as having a top.
  float lip = 1.0 - smoothstep(STORM_EDGE, STORM_EDGE + 0.14, s);
  storm = mix(storm, uLight * 1.2, lip * 0.6);

  // --- the ring tile's own ground, left clear up to the cloud's edge ---
  // Its terrain is drawn underneath (client-map-3d-terrain-tile-rules.ts),
  // printed like the remembered land it borders, so the ring simply
  // continues that land until the brass edge -- no wash over it.
  float stormCover = max(deep, smoothstep(STORM_EDGE - sw, STORM_EDGE + sw, s));
  vec3 col = storm;
  float coverAlpha = stormCover;

  // --- brass survey edge on the cloud's edge ---
  // A bright brass line on the contour and a darker brass edge just on the
  // storm side. (No tick marks at tile crossings: they read as a
  // scatter of glowing lines along the border.)
  float dRim = s - STORM_EDGE;
  float rimHalf = max(0.012, sw * 1.5);
  float brass = (1.0 - deep) * (1.0 - smoothstep(rimHalf, rimHalf + sw, abs(dRim)));
  float brassEdge = (1.0 - deep) * (1.0 - smoothstep(rimHalf * 0.6, rimHalf * 0.6 + sw, abs(dRim - rimHalf * 1.6)));
  col = mix(col, uBrassDark, brassEdge * 0.9);
  col = mix(col, uBrass, brass);
  coverAlpha = max(coverAlpha, max(brass, brassEdge * 0.9));

  // Lantern light: the storm glows warm just behind the brass edge.
  float lantern = (1.0 - deep) * stormCover * exp(-max(dRim, 0.0) * 9.0);
  col += uLantern * lantern * 0.35;

  // Lantern flash on the clouds as they roll back off newly explored tiles.
  col += uLantern * revealFront * 0.5;

  // Explored tiles are never drawn on.
  float alpha = hard * edgeAa * coverAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
