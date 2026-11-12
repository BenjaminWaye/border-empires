// Sci-fi road surface candidates. All share the road UV contract: vUv.x is arc
// length along the ribbon (world units), vUv.y runs 0..1 across it. Junction
// hubs put v = 0.5 at the centre and v = 1.0 on the rim, so `c` below (0 at the
// centreline, 1 at the edge) also runs centre -> rim on hubs.
//
// Each writes alpha, so the ground shows between the pieces instead of the road
// reading as a solid painted strip.

const header = (roadWidth: number): string => `
precision highp float;
varying vec2 vUv;
uniform float uTime;
const float W = ${roadWidth.toFixed(4)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// 1. District link — the same dark pipe + twin brass rails + warm light core
//    used for the town -> support-building links (district-links-3d.ts), so
//    roads read as part of one infrastructure family.
const linkBody = `
void main() {
  float u = vUv.x;
  float c = abs(vUv.y - 0.5) * 2.0;
  float aa = 0.06;

  // Dark hex pipe, shaded as a cylinder seen from above.
  float body = 1.0 - smoothstep(0.52 - aa, 0.52, c);
  float bc = clamp(c / 0.52, 0.0, 1.0);
  vec3 col = vec3(0.196, 0.208, 0.231) * (0.55 + 0.75 * sqrt(1.0 - bc * bc));
  // Collars every so often, like pipe joints.
  float collar = step(0.86, fract(u / 0.11)) * body;
  col = mix(col, vec3(0.30, 0.31, 0.34), collar * 0.8);

  // Warm light core down the top of the pipe.
  float core = 1.0 - smoothstep(0.10, 0.17, c);
  col = mix(col, vec3(0.86, 0.73, 0.49), core);

  // Twin brass rails either side, ground visible in the gap.
  float rail = 1.0 - smoothstep(0.10 - aa, 0.10, abs(c - 0.85));
  float rc = clamp(abs(c - 0.85) / 0.10, 0.0, 1.0);
  vec3 brass = vec3(0.74, 0.59, 0.33) * (0.6 + 0.6 * sqrt(1.0 - rc * rc));
  col = mix(col, brass, rail * (1.0 - body));

  float alpha = max(body, rail);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

// 2. Energy beam — no surface at all: a hot cyan core with a soft halo and
//    bright pulses running along it, over a faint scorched shadow.
const beamBody = `
void main() {
  float u = vUv.x;
  float c = abs(vUv.y - 0.5) * 2.0;
  float pulse = pow(0.5 + 0.5 * sin(u * 38.0 - uTime * 3.2), 8.0);
  float core = exp(-c * c * 55.0);
  float halo = exp(-c * c * 6.0) * (0.45 + 0.45 * pulse);
  float glow = clamp(core + halo, 0.0, 1.0);
  vec3 glowCol = mix(vec3(0.20, 0.75, 1.00), vec3(0.85, 0.98, 1.00), core);
  float shadow = (1.0 - smoothstep(0.6, 1.0, c)) * 0.22;
  vec3 col = mix(vec3(0.03, 0.05, 0.07), glowCol, glow / max(0.001, max(glow, shadow)));
  float alpha = max(glow, shadow);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

// 3. Circuit trace — etched into the ground like a PCB: two dark grooves, a
//    faint lit trace between them and solder-pad nodes at intervals.
const traceBody = `
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float c = abs(v - 0.5) * 2.0;
  float vw = (v - 0.5) * W;

  // Hairline grooves with bare ground between them — no fill, so it reads
  // as lines cut into the terrain rather than a tube lying on it.
  float groove = 1.0 - smoothstep(0.035, 0.07, abs(c - 0.78));
  float trace = 1.0 - smoothstep(0.08, 0.14, c);

  // Pads: a dark ring with a lit centre every 0.16 along the trace.
  vec2 pc = vec2((fract(u / 0.16) - 0.5) * 0.16, vw);
  float pd = length(pc);
  float padRing = (1.0 - smoothstep(0.015, 0.019, pd)) * smoothstep(0.008, 0.011, pd);
  float padCore = 1.0 - smoothstep(0.006, 0.009, pd);

  vec3 etch = vec3(0.04, 0.045, 0.05);
  vec3 lit = vec3(0.55, 0.97, 1.00);
  vec3 col = etch;
  float alpha = max(groove * 0.9, padRing * 0.9);
  float lightAmt = max(trace * 0.75, padCore);
  col = mix(col, lit, lightAmt);
  alpha = max(alpha, lightAmt);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

// 4. Hex plating — a path of dark steel hex plates with faintly glowing seams,
//    fading into the ground at the edges.
const hexBody = `
vec4 hexCell(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, p - gv);
}
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float c = abs(v - 0.5) * 2.0;
  vec4 hc = hexCell(vec2((v - 0.5) * W, u) / 0.05);
  vec2 ag = abs(hc.xy);
  float hd = max(dot(ag, normalize(vec2(1.0, 1.7320508))), ag.x);
  float seam = smoothstep(0.44, 0.49, hd);
  float tone = hash(floor(hc.zw * 10.0));
  vec3 plate = mix(vec3(0.13, 0.15, 0.18), vec3(0.22, 0.25, 0.29), tone);
  // Bevel: plates lighter toward the top-left, darker toward their rim.
  plate *= 1.0 + (hc.y - hc.x) * 0.25 - smoothstep(0.30, 0.44, hd) * 0.25;
  float breathe = 0.75 + 0.25 * sin(uTime * 1.3 + tone * 6.28);
  vec3 col = mix(plate, vec3(0.30, 0.85, 0.95) * breathe, seam * 0.7);
  float alpha = 1.0 - smoothstep(0.70, 1.0, c);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

export const buildLinkRoadFragment = (roadWidth: number): string => header(roadWidth) + linkBody;
export const buildBeamRoadFragment = (roadWidth: number): string => header(roadWidth) + beamBody;
export const buildTraceRoadFragment = (roadWidth: number): string => header(roadWidth) + traceBody;
export const buildHexRoadFragment = (roadWidth: number): string => header(roadWidth) + hexBody;
