// Sci-fi transit-lane road surface: a dark segmented alloy deck between two
// raised bright rails, a cyan light strip just inside each rail, and glowing
// guidance dashes down the centre. The light breathes slowly on uTime (a
// uniform, never baked into geometry, so camera pans don't restart it).
//
// UV contract (shared with the other road styles): vUv.x is arc length along
// the ribbon in world units, vUv.y runs 0..1 across the road. Junction hubs use
// v = 0.5 at the centre and v = 1.0 on the rim, so the rail + light strip wrap
// the hub's rim and the centre reads as a glowing node.
export const buildTransitRoadFragment = (roadWidth: number): string => `
precision highp float;
varying vec2 vUv;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

void main() {
  float u = vUv.x;
  float v = vUv.y;
  float vw = v * ${roadWidth.toFixed(4)};
  float distToEdge = min(v, 1.0 - v);
  float breathe = 0.82 + 0.18 * sin(uTime * 1.7);

  // === Alloy deck: segmented panels along the lane ===
  float panelLen = 0.075;
  float panelIdx = floor(u / panelLen);
  float panelU = fract(u / panelLen);
  float tone = hash(vec2(panelIdx, 3.1));
  vec3 deckDark = vec3(0.10, 0.12, 0.15);
  vec3 deckLight = vec3(0.17, 0.20, 0.24);
  vec3 col = mix(deckDark, deckLight, tone);
  // Fine brushed grain running along the lane.
  col += (vnoise(vec2(u * 9.0, vw * 900.0)) - 0.5) * 0.035;
  // Panel seams: a dark groove with a thin lit lip on one side.
  float seam = 1.0 - smoothstep(0.0, 0.05, min(panelU, 1.0 - panelU));
  col *= 1.0 - seam * 0.55;
  col += smoothstep(0.05, 0.0, abs(panelU - 0.06)) * 0.035;
  // Longitudinal split between the two lanes.
  float midGroove = 1.0 - smoothstep(0.0, 0.025, abs(v - 0.5));

  // === Outer rails: raised bright metal at each edge ===
  float rail = 1.0 - smoothstep(0.06, 0.10, distToEdge);
  vec3 railCol = vec3(0.56, 0.62, 0.68) * (0.85 + 0.15 * smoothstep(0.10, 0.03, distToEdge));
  col = mix(col, railCol, rail);
  // Shadow line where the rail meets the deck.
  col *= 1.0 - smoothstep(0.03, 0.0, abs(distToEdge - 0.11)) * 0.45;

  // === Cyan light strips just inside each rail ===
  vec3 glowCol = vec3(0.30, 0.88, 1.00);
  // Wide enough to survive the road's ~0.12-tile width at normal map zoom.
  float strip = smoothstep(0.06, 0.02, abs(distToEdge - 0.17));
  float stripHalo = smoothstep(0.14, 0.0, abs(distToEdge - 0.17)) * 0.40;
  col = mix(col, glowCol, clamp((strip + stripHalo) * breathe, 0.0, 1.0));

  // === Centre guidance dashes ===
  float dashOn = step(0.45, fract(u / 0.09));
  float dashCore = smoothstep(0.045, 0.0, abs(v - 0.5)) * dashOn;
  float dashHalo = smoothstep(0.12, 0.0, abs(v - 0.5)) * dashOn * 0.25;
  col *= 1.0 - midGroove * (1.0 - dashOn) * 0.35;
  col = mix(col, vec3(0.62, 0.96, 1.00), clamp((dashCore + dashHalo) * breathe, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;
