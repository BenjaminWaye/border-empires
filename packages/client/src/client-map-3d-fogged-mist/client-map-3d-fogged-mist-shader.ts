// GLSL for client-map-3d-fogged-mist.ts. Draws over every tile not in sight
// (unexplored tiles too, though the storm covers those), and never on tiles in
// sight. Its edge is cut exactly like the unexplored storm's coast
// (client-map-3d-unexplored-storm-shader.ts), from the same blurred field,
// clearance arcs and drifting wobble: it runs through the first ring of tiles
// past your vision, bending round their corners, so the fog ends just outside
// what you can see instead of on a square tile edge. A pale bank of mist
// thickens along that edge. Inside, a thin haze covers everything and
// drifting banks of paler wisps roll over it, so remembered land reads as fog
// rather than a recoloured or broken patch of map. On flat fogged land
// (mask A) the slate wash is drawn here too, cut at the same edge; on hills
// and mountains, which rise through the sheet, client-map-3d.ts draws it per tile.

import { STORM_FIELD_GLSL } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-field-glsl.js";

export const FOGGED_MIST_VERTEX_SHADER = `
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

export const FOGGED_MIST_FRAGMENT_SHADER = `
varying vec2 vSceneXZ;
varying vec2 vWorldXZ;
uniform float uTime;
uniform vec3 uHaze;
uniform vec3 uLight;
uniform vec3 uWash;
uniform float uWashOpacity;
uniform float uMinOpacity;
uniform float uMaxOpacity;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;

${STORM_FIELD_GLSL}
void main() {
  vec2 w = vWorldXZ;
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  // The storm's coast contour, with "explored" read as "in sight".
  float soft = outside ? 0.0 : stormSoftField(uMask, uv, uMaskSize);
  float clearance = stormExploredDistance(uMask, uMaskMin, uMaskSize, vSceneXZ);
  float s = stormClearanceField(soft + stormEdgeNoise(w, uTime) * 0.1, clearance);
  float sw = clamp(fwidth(s), 0.004, 0.04);
  float cover = outside ? 0.0 : max(smoothstep(0.97, 0.995, soft), smoothstep(STORM_EDGE - sw, STORM_EDGE + sw * 2.0, s));
  // Mist banks thicken along the edge, so the fog's border reads.
  float lip = 1.0 - smoothstep(STORM_EDGE, STORM_EDGE + 0.16, s);
  // Broad banks drifting one way, finer wisps another, warped by the banks.
  float banks = stormFbm(w * 0.22 + vec2(uTime * 0.035, uTime * 0.012));
  float wisps = stormFbm(w * 0.75 + vec2(-uTime * 0.05, uTime * 0.03) + banks * 1.5);
  float density = clamp(smoothstep(0.3, 0.85, banks * 0.6 + wisps * 0.4) + lip * 0.45, 0.0, 1.0);
  vec3 mist = mix(uHaze, uLight, density);
  float mistAlpha = mix(uMinOpacity, uMaxOpacity, density);
  // Flat fogged land: the tile's slate wash, under the mist.
  float washAlpha = outside ? 0.0 : uWashOpacity * texture2D(uMask, (floor(vSceneXZ) + 0.5 - uMaskMin) / uMaskSize).a;
  float alpha = mistAlpha + washAlpha * (1.0 - mistAlpha);
  vec3 col = (mist * mistAlpha + uWash * washAlpha * (1.0 - mistAlpha)) / max(alpha, 0.0001);
  alpha *= cover;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
