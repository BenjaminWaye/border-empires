// GLSL for client-map-3d-fogged-mist.ts. Draws over every tile not in sight
// (unexplored tiles too, though the storm covers those), and never on tiles in
// sight. Its edge is cut exactly like the unexplored storm's coast
// (client-map-3d-unexplored-storm-shader.ts), from the same blurred field,
// clearance arcs and drifting wobble (foggedEdge, shared with the fog
// overlays it sits over): it runs through the first ring of tiles past your
// vision, bending round their corners, so the fog ends just outside what you
// can see instead of on a square tile edge. A pale bank of mist thickens
// along that edge. Inside, a thin haze covers everything and drifting banks of
// paler wisps roll over it, so remembered land reads as fog rather than a
// recoloured or broken patch of map. The noise is only evaluated where the
// mist actually covers: everything else is discarded first.

import { FOGGED_EDGE_COVER_GLSL } from "./client-map-3d-fogged-edge-clip.js";

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
uniform float uMinOpacity;
uniform float uMaxOpacity;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;

${FOGGED_EDGE_COVER_GLSL}
void main() {
  vec2 w = vWorldXZ;
  vec2 uv = (vSceneXZ - uMaskMin) / uMaskSize;
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  vec2 edge = foggedEdge(uMask, uMaskMin, uMaskSize, vSceneXZ, w, uTime);
  float cover = outside ? 0.0 : edge.y;
  if (cover < 0.005) discard;
  // Mist banks thicken along the edge, so the fog's border reads.
  float lip = 1.0 - smoothstep(STORM_EDGE, STORM_EDGE + 0.16, edge.x);
  // Broad banks drifting one way, finer wisps another, warped by the banks.
  float banks = stormFbm(w * 0.22 + vec2(uTime * 0.035, uTime * 0.012));
  float wisps = stormFbm(w * 0.75 + vec2(-uTime * 0.05, uTime * 0.03) + banks * 1.5);
  float density = clamp(smoothstep(0.3, 0.85, banks * 0.6 + wisps * 0.4) + lip * 0.45, 0.0, 1.0);
  gl_FragColor = vec4(mix(uHaze, uLight, density), mix(uMinOpacity, uMaxOpacity, density) * cover);
  #include <colorspace_fragment>
}
`;
