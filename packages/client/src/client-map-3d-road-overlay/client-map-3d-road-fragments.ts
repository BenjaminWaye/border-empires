export type RoadOverlayStyle = "dirt" | "brick";

export const ROAD_WIDTH = 0.12;

// The old cobblestone surface, preserved so Storybook can keep showing the
// original paved-town look while the game ships the dirt style.
export const BRICK_FRAGMENT = `
precision highp float;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) { return 0.5*vnoise(p) + 0.25*vnoise(p*2.1) + 0.125*vnoise(p*4.3); }

vec3 stoneColor(float idx) {
  if (idx < 1.0) return vec3(0.77, 0.62, 0.46);
  if (idx < 2.0) return vec3(0.70, 0.55, 0.41);
  if (idx < 3.0) return vec3(0.84, 0.68, 0.50);
  if (idx < 4.0) return vec3(0.62, 0.48, 0.36);
  return vec3(0.74, 0.58, 0.43);
}

void main() {
  float u = vUv.x * 3.0;
  float v = vUv.y;

  // === Edge grass transition ===
  float grassFade = smoothstep(0.0, 0.06, v) * smoothstep(1.0, 0.94, v);
  float edgeAmount = 1.0 - grassFade;
  vec3 edgeGrass = vec3(0.30, 0.38, 0.20);

  // === Wheel ruts ===
  float rut1 = exp(-pow((v - 0.30) * 14.0, 2.0));
  float rut2 = exp(-pow((v - 0.70) * 14.0, 2.0));
  float rut = clamp(rut1 + rut2, 0.0, 1.0);

  // === Cobblestone grid ===
  vec2 cellSize = vec2(0.10, 0.07);
  vec2 cellIdx = floor(vec2(u, v) / cellSize);
  vec2 cellUV = fract(vec2(u, v) / cellSize) - 0.5;

  float ch = hash(cellIdx);
  float ch2 = hash(cellIdx + vec2(0.7, 0.3));
  vec2 jitter = (vec2(ch, ch2) - 0.5) * 0.3;
  vec2 sp = cellUV - jitter;

  float stoneW = 0.38 + ch * 0.10;
  float stoneH = 0.32 + hash(cellIdx + vec2(0.1, 0.2)) * 0.12;
  float sd = max(abs(sp.x) / stoneW, abs(sp.y) / stoneH);

  vec3 mortar = vec3(0.32, 0.24, 0.16);
  vec3 cobble = stoneColor(floor(ch * 4.99));
  float stoneWear = vnoise(sp * 5.0 + cellIdx * 3.0) * 0.08;
  cobble += stoneWear;

  float isStone = 1.0 - smoothstep(0.42, 0.58, sd);
  float isMortar = 1.0 - isStone;
  vec3 col = mix(mortar, cobble, isStone);

  // === Stone edge shadow (3D bump) ===
  float stoneEdge = smoothstep(0.5, 0.58, sd) * isStone * 0.15;
  col *= (1.0 - stoneEdge);

  // === Light/shadow across stone (top-left light) ===
  float stoneBump = (0.5 - sd) * isStone * 0.5;
  vec2 lightDir = normalize(vec2(0.7, 0.7));
  float stoneLight = stoneBump * (lightDir.x * sp.x + lightDir.y * sp.y) * 2.0;
  col *= (1.0 + stoneLight * 0.1);

  // === Wheel rut darkening ===
  col = mix(col, vec3(0.20, 0.15, 0.10), rut * 0.55);
  float rutGrain = vnoise(vec2(u * 30.0, v * 15.0)) * 0.08 * rut;
  col *= (1.0 - rutGrain);

  // === Crown (center lighter strip) ===
  float crown = exp(-pow((v - 0.5) * 6.0, 2.0));
  col *= (1.0 + crown * 0.07);

  // === Surface gravel and grain ===
  float gravel = vnoise(vec2(u * 40.0, v * 25.0));
  col += (gravel - 0.5) * 0.04;
  float grain = vnoise(vec2(u * 70.0, v * 70.0));
  col += (grain - 0.5) * 0.03;

  // === Puddles (random dark patches) ===
  float puddleNoise = fbm(vec2(u * 0.8, v * 1.2));
  float puddle = smoothstep(0.55, 0.70, puddleNoise) * (1.0 - rut) * (1.0 - crown);
  vec3 puddleColor = mix(vec3(0.15, 0.12, 0.08), vec3(0.25, 0.18, 0.10), puddleNoise * 2.0);
  col = mix(col, puddleColor, puddle * 0.4);

  // === Edge grass overlay ===
  float grassNoise = fbm(vec2(u * 1.5, v * 0.5));
  float edgeGrassAmount = edgeAmount * (0.3 + grassNoise * 0.3);
  col = mix(col, edgeGrass, edgeGrassAmount);

  gl_FragColor = vec4(col, 1.0);
}
`;

// Packed-dirt road surface. Deliberately carries no green: the edge wears down
// into the dirt's own tone, so the road reads correctly on grass AND sand
// biomes instead of tinting green.
export const DIRT_FRAGMENT = `
precision highp float;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) { return 0.5*vnoise(p) + 0.25*vnoise(p*2.1) + 0.125*vnoise(p*4.3); }

// Layered soil-height field. Sampled anisotropically — features clump along
// the road direction (u) and squish across the width (vw) — so the surface
// reads as wind- and wheel-eroded packed dirt. Drives both the colour mottling
// and the fake bump normal below.
float soilH(vec2 p) {
  float h = fbm(vec2(p.x * 0.5, p.y * 5.0)) * 0.70;
  h += fbm(vec2(p.x * 1.6, p.y * 16.0)) * 0.38;
  h += vnoise(vec2(p.x * 4.0, p.y * 40.0)) * 0.22;
  return h;
}

void main() {
  float u = vUv.x; // arc length along the road (world units)
  float v = vUv.y; // across the road, 0..1 (0.5 = road centre for junction hubs)
  float vw = v * ${ROAD_WIDTH};
  vec2 wp = vec2(u, vw);

  // Distance to the nearest road edge. Kept in v-space so junction hubs get
  // the worn rim around the hub rim instead of across their whole disc.
  float distToEdge = min(v, 1.0 - v);
  float edgeAmount = 1.0 - smoothstep(0.02, 0.11, distToEdge);

  // === Bump normal from the soil-height field ===
  // The biggest step away from a flat brown smear: the surface gets real
  // relief lit by the scene sun, so clods and gravel cast shadows.
  float e = 0.004;
  float hSelf = soilH(wp);
  float hR = soilH(wp + vec2(e, 0.0));
  float hT = soilH(wp + vec2(0.0, e));
  vec3 nrm = normalize(vec3((hSelf - hR) * 2.0, 0.25, (hSelf - hT) * 2.0));

  // === Packed-dirt base, toned by the height field ===
  vec3 soilDark = vec3(0.49, 0.39, 0.27);
  vec3 soilLight = vec3(0.64, 0.54, 0.38);
  vec3 col = mix(soilDark, soilLight, smoothstep(0.25, 1.75, hSelf));

  // === Dense fine gravel: small stones set densely into the soil ===
  vec2 gScale = vec2(52.0, 66.0);
  vec2 gCell = floor(wp * gScale);
  vec2 gCellUV = fract(wp * gScale) - 0.5;
  float g1 = hash(gCell);
  float g2 = hash(gCell + vec2(11.3, 7.7));
  vec2 gc = gCellUV - (vec2(g1, g2) - 0.5) * 0.62;
  float gRad = 0.16 + fract(g2 * 3.7) * 0.16;
  float gsd = length(gc) / gRad;
  float stone = smoothstep(0.72, 1.0, gsd) * step(0.42, g1);
  vec3 stoneTone = mix(vec3(0.38, 0.36, 0.33), vec3(0.74, 0.67, 0.55), step(0.5, g2));
  // Light-facing shading on each stone so they read as raised, not painted on.
  float stoneShade = clamp(dot(normalize(vec3(gc.x, gc.y, 0.6)), normalize(vec3(0.5, 0.7, 0.5))), 0.0, 1.0);
  col = mix(col, stoneTone * (0.70 + 0.60 * stoneShade), stone);
  // Contact shadow where stones sit in the soil.
  col *= 1.0 - smoothstep(1.0, 1.25, gsd) * stone * 0.16;

  // === Wheel ruts: two packed lanes, dusty core with a darker packed edge ===
  float track = clamp(exp(-pow((vw - 0.033) * 85.0, 2.0)) + exp(-pow((vw - 0.087) * 85.0, 2.0)), 0.0, 1.0);
  col = mix(col, vec3(0.44, 0.35, 0.24), track * 0.32);
  float dust = clamp(exp(-pow((vw - 0.033) * 115.0, 2.0)) + exp(-pow((vw - 0.087) * 115.0, 2.0)), 0.0, 1.0);
  col = mix(col, vec3(0.70, 0.60, 0.44), dust * 0.22);

  // === Crown: the flattened middle rides slightly higher and lighter ===
  float crownAmt = exp(-pow((vw - ${ROAD_WIDTH} * 0.5) * 60.0, 2.0));
  col = mix(col, vec3(0.67, 0.57, 0.41), crownAmt * 0.20);

  // === Worn patches: occasional mottled, lighter weathered soil ===
  float wornPatch = fbm(vec2(u * 1.8, vw * 18.0));
  col = mix(col, vec3(0.56, 0.47, 0.33), smoothstep(0.60, 0.74, wornPatch) * 0.30);

  // === Pebbles: a few larger, clearly-spaced stones ===
  vec2 pCellSize = vec2(0.22, 0.026);
  vec2 pCell = floor(wp / pCellSize);
  vec2 pCellUV = fract(wp / pCellSize) - 0.5;
  float p1 = hash(pCell);
  float p2 = hash(pCell + vec2(7.3, 1.9));
  float p3 = hash(pCell + vec2(3.7, 5.1));
  float present = step(0.72, p1);
  vec2 pc = (pCellUV - (vec2(p2, p3) - 0.5) * 0.4) * pCellSize;
  float pebRadius = 0.006 + p3 * 0.007;
  float pd = length(pc) / pebRadius;
  float pebble = present * (1.0 - smoothstep(0.82, 1.0, pd)) * (1.0 - edgeAmount);
  if (pebble > 0.01) {
    vec3 pebbleDark = vec3(0.40, 0.35, 0.30);
    vec3 pebbleLight = vec3(0.73, 0.64, 0.49);
    vec3 pebbleTone = mix(pebbleDark, pebbleLight, step(0.5, p2));
    col = mix(col, pebbleTone, pebble);
    col *= 1.0 - pebble * smoothstep(1.0, 0.55, pd) * 0.20;
  }

  // === Eroded rim: a ragged worn edge in the dirt's own tone ===
  // Deliberately no grass and no green — the road must read naturally against
  // every biome (grass, dirt, or sand), so the edge just darkens into packed
  // earth with a slightly irregular line.
  float rimNoise = vnoise(vec2(u * 3.0 + 7.7, vw * 120.0));
  float rim = edgeAmount * clamp(0.40 + rimNoise * 0.7, 0.0, 1.0);
  col *= 1.0 - rim * 0.14;

  // === Sunlight shading: lights clods and gravel, casts a soft shadow into
  // hollows, and lifts the crest of each bump ===
  vec3 sunDir = normalize(vec3(0.60, 0.80, 0.38));
  float diff = clamp(dot(nrm, sunDir), 0.0, 1.0);
  float shade = 0.78 + diff * 0.55 + (nrm.y - 0.5) * 0.20;
  col *= clamp(shade, 0.0, 1.6);

  // Worn rim: a touch darker just inside the road edge.
  col *= mix(0.92, 1.0, smoothstep(0.06, 0.22, distToEdge));

  gl_FragColor = vec4(col, 1.0);
}
`;

export const buildRoadFragmentShader = (style: RoadOverlayStyle): string =>
  style === "brick" ? BRICK_FRAGMENT : DIRT_FRAGMENT;
