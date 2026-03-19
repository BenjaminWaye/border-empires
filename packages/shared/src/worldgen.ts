import type { LandBiome, RegionType, ResourceType, Terrain } from "./types.js";
import { wrapX, wrapY } from "./math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

let CURRENT_WORLD_SEED = 42;
export const setWorldSeed = (seed: number): void => {
  CURRENT_WORLD_SEED = Math.floor(seed);
};
export const getWorldSeed = (): number => CURRENT_WORLD_SEED;
const worldSeed = (): number => CURRENT_WORLD_SEED;
const TAU = Math.PI * 2;

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const valueNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = seeded01(gx, gy, seed);
  const n10 = seeded01(gx + 1, gy, seed);
  const n01 = seeded01(gx, gy + 1, seed);
  const n11 = seeded01(gx + 1, gy + 1, seed);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
};

const toroidDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};
const toroidDy = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_HEIGHT - d);
};
const linearDx = (a: number, b: number): number => Math.abs(a - b);
const linearDy = (a: number, b: number): number => Math.abs(a - b);

type ContinentSeed = { cx: number; cy: number; rx: number; ry: number; wobble: number; lobeA: number; lobeB: number; coastSeed: number };
const buildContinents = (): ContinentSeed[] => {
  const seed = worldSeed();
  const scaleX = WORLD_WIDTH / 1000;
  const scaleY = WORLD_HEIGHT / 1000;
  const s = (v: number, axis: "x" | "y"): number => Math.max(24, Math.floor(v * (axis === "x" ? scaleX : scaleY)));
  const yBase = Math.floor(WORLD_HEIGHT * 0.53);
  const out: ContinentSeed[] = [
    {
      cx: Math.floor(WORLD_WIDTH * 0.18),
      cy: yBase + Math.floor((seeded01(11, 13, seed + 101) - 0.5) * s(90, "y")),
      rx: s(145 + Math.floor(seeded01(31, 37, seed + 111) * 24), "x"),
      ry: s(210 + Math.floor(seeded01(41, 43, seed + 121) * 28), "y"),
      wobble: seeded01(47, 53, seed + 131) * TAU,
      lobeA: seeded01(109, 113, seed + 311) * TAU,
      lobeB: seeded01(127, 131, seed + 321) * TAU,
      coastSeed: seed + 331
    },
    {
      cx: Math.floor(WORLD_WIDTH * 0.5),
      cy: yBase + Math.floor((seeded01(17, 19, seed + 141) - 0.5) * s(96, "y")),
      rx: s(150 + Math.floor(seeded01(59, 61, seed + 151) * 26), "x"),
      ry: s(225 + Math.floor(seeded01(67, 71, seed + 161) * 26), "y"),
      wobble: seeded01(73, 79, seed + 171) * TAU,
      lobeA: seeded01(137, 139, seed + 341) * TAU,
      lobeB: seeded01(149, 151, seed + 351) * TAU,
      coastSeed: seed + 361
    },
    {
      cx: Math.floor(WORLD_WIDTH * 0.82),
      cy: yBase + Math.floor((seeded01(23, 29, seed + 181) - 0.5) * s(88, "y")),
      rx: s(142 + Math.floor(seeded01(83, 89, seed + 191) * 24), "x"),
      ry: s(208 + Math.floor(seeded01(97, 101, seed + 201) * 28), "y"),
      wobble: seeded01(103, 107, seed + 211) * TAU,
      lobeA: seeded01(157, 163, seed + 371) * TAU,
      lobeB: seeded01(167, 173, seed + 381) * TAU,
      coastSeed: seed + 391
    }
  ];
  return out;
};
let cachedContinentSeed = Number.NaN;
let cachedContinents: ContinentSeed[] = [];
const continents = (): ContinentSeed[] => {
  const seed = worldSeed();
  if (seed !== cachedContinentSeed || cachedContinents.length === 0) {
    cachedContinentSeed = seed;
    cachedContinents = buildContinents();
  }
  return cachedContinents;
};

const continentScore = (x: number, y: number): { index: number; score: number } => {
  let bestIdx = -1;
  let best = 0;
  const cs = continents();
  for (let i = 0; i < cs.length; i += 1) {
    const c = cs[i]!;
    const dx = linearDx(x, c.cx);
    const dy = linearDy(y, c.cy);
    const angle = Math.atan2(y - c.cy, x - c.cx);
    // Directional lobe modulation creates peninsula/bay-like silhouettes.
    const directional =
      1 +
      Math.sin(angle * 3 + c.lobeA) * 0.22 +
      Math.sin(angle * 5 + c.lobeB) * 0.14 +
      Math.sin(angle * 7 + c.wobble) * 0.08;
    const radialNoise = valueNoise(x + c.cx * 0.7, y + c.cy * 0.7, 88, c.coastSeed);
    const coastWarp = 1 + (radialNoise - 0.5) * 0.25;
    const rx = c.rx * directional * coastWarp;
    const ry = c.ry * directional * coastWarp;
    const nx = dx / Math.max(1, rx);
    const ny = dy / Math.max(1, ry);
    const base = 1 - Math.sqrt(nx * nx + ny * ny);
    if (base <= 0) continue;
    const macroNoise = valueNoise(x + c.cx, y + c.cy, 210, c.coastSeed + 17);
    const microNoise = valueNoise(x + c.cx, y + c.cy, 56, c.coastSeed + 23);
    const shorelineRoughness = 1 + (macroNoise - 0.5) * 0.3 + (microNoise - 0.5) * 0.18;
    const score = base * shorelineRoughness;
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  }
  return { index: bestIdx, score: best };
};
const continentField = (x: number, y: number): number => {
  const s = continentScore(x, y);
  return s.score;
};

export const continentIdAt = (x: number, y: number): number | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const out = continentScore(wx, wy);
  if (out.index < 0 || out.score < 0.09) return undefined;
  return out.index;
};

const isOceanChannel = (x: number, y: number): boolean => {
  const yn = y / WORLD_HEIGHT;
  const xn = x / WORLD_WIDTH;

  // Narrow channels; max width around 80 (2*40).
  const c1 = WORLD_WIDTH * 0.33 + Math.sin(yn * TAU * 1.4 + 0.4) * 70 + Math.sin(yn * TAU * 3.2) * 24;
  const c2 = WORLD_WIDTH * 0.67 + Math.sin(yn * TAU * 1.25 + 2.0) * 65 + Math.sin(yn * TAU * 2.9 + 1.4) * 22;
  const r1 = WORLD_HEIGHT * 0.57 + Math.sin(xn * TAU * 1.2 + 1.1) * 62 + Math.sin(xn * TAU * 2.6 + 0.3) * 20;

  const w1 = 8 + Math.floor(valueNoise(x, y, 320, worldSeed() + 241) * 14); // 8..22
  const w2 = 8 + Math.floor(valueNoise(x, y, 280, worldSeed() + 251) * 14); // 8..22
  const w3 = 8 + Math.floor(valueNoise(x, y, 300, worldSeed() + 261) * 12); // 8..20

  const d1 = toroidDx(x, wrapX(Math.floor(c1), WORLD_WIDTH));
  const d2 = toroidDx(x, wrapX(Math.floor(c2), WORLD_WIDTH));
  const d3 = toroidDy(y, wrapY(Math.floor(r1), WORLD_HEIGHT));

  return d1 <= w1 || d2 <= w2 || d3 <= w3;
};

const riverCenterX = (y: number, index: number): number => {
  const yn = y / WORLD_HEIGHT;
  if (index === 0) return WORLD_WIDTH * 0.14 + Math.sin(yn * TAU * 1.8 + 0.3) * 45 + Math.sin(yn * TAU * 4.1) * 11;
  if (index === 1) return WORLD_WIDTH * 0.29 + Math.sin(yn * TAU * 1.4 + 1.7) * 42 + Math.sin(yn * TAU * 3.4) * 13;
  if (index === 2) return WORLD_WIDTH * 0.46 + Math.sin(yn * TAU * 1.6 + 2.4) * 40 + Math.sin(yn * TAU * 3.8) * 10;
  if (index === 3) return WORLD_WIDTH * 0.61 + Math.sin(yn * TAU * 1.2 + 0.9) * 44 + Math.sin(yn * TAU * 4.6) * 12;
  if (index === 4) return WORLD_WIDTH * 0.76 + Math.sin(yn * TAU * 1.9 + 2.9) * 41 + Math.sin(yn * TAU * 4.8) * 10;
  if (index === 5) return WORLD_WIDTH * 0.9 + Math.sin(yn * TAU * 1.5 + 1.4) * 38 + Math.sin(yn * TAU * 3.6) * 11;
  if (index === 6) return WORLD_WIDTH * 0.52 + Math.sin(yn * TAU * 1.1 + 2.1) * 38 + Math.sin(yn * TAU * 4.4) * 12;
  if (index === 7) return WORLD_WIDTH * 0.35 + Math.sin(yn * TAU * 1.7 + 1.1) * 40 + Math.sin(yn * TAU * 3.9) * 12;
  if (index === 8) return WORLD_WIDTH * 0.22 + Math.sin(yn * TAU * 1.3 + 0.5) * 36 + Math.sin(yn * TAU * 4.3) * 11;
  return WORLD_WIDTH * 0.72 + Math.sin(yn * TAU * 1.55 + 2.6) * 38 + Math.sin(yn * TAU * 4.0) * 10;
};

const isRiver = (x: number, y: number): boolean => {
  const cField = continentField(x, y);
  if (cField < 0.07) return false;
  for (let i = 0; i < 14; i += 1) {
    const cx = wrapX(Math.floor(riverCenterX(y, i)), WORLD_WIDTH);
    const width = 1 + Math.floor(valueNoise(x + i * 113, y, 140, worldSeed() + 75 + i) * 3); // 1..3 tiles
    const lane = Math.floor((y + i * 19) / 50); // ~50-tile strip segments
    const active = seeded01(lane, i, worldSeed() + 332) > 0.10;
    if (active && toroidDx(x, cx) <= width) return true;
  }
  return false;
};

const isMicroRiver = (x: number, y: number): boolean => {
  if (continentField(x, y) < 0.1) return false;
  const cell = 18;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  if (seeded01(gx, gy, worldSeed() + 2601) < 0.965) return false;
  const ox = Math.floor(seeded01(gx, gy, worldSeed() + 2602) * cell);
  const oy = Math.floor(seeded01(gx, gy, worldSeed() + 2603) * cell);
  const startX = gx * cell + ox;
  const startY = gy * cell + oy;
  const horizontal = seeded01(gx, gy, worldSeed() + 2604) > 0.5;
  const len = 8 + Math.floor(seeded01(gx, gy, worldSeed() + 2605) * 3); // 8..10
  if (horizontal) {
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    return dx <= len && dy <= 0;
  }
  const dx = Math.abs(x - startX);
  const dy = Math.abs(y - startY);
  return dy <= len && dx <= 0;
};

const isLake = (x: number, y: number): boolean => {
  if (continentField(x, y) < 0.09) return false;
  const cell = 52;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const hasLake = seeded01(gx, gy, worldSeed() + 71) > 0.89;
  if (!hasLake) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, worldSeed() + 72) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, worldSeed() + 73) * cell);
  const r = 2 + Math.floor(seeded01(gx, gy, worldSeed() + 74) * 6);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

const isMountainRange = (x: number, y: number): boolean => {
  // Thin mountain ranges: 1-2 tiles wide, segmented in ~30-tile strips.
  const warpedX = x + Math.sin(y * 0.0105 + 0.7) * 140 + Math.sin(y * 0.031 + 2.2) * 44;
  const warpedY = y + Math.sin(x * 0.0097 + 1.3) * 120 + Math.sin(x * 0.027 + 0.4) * 36;

  const periodA = 150;
  const posA = ((warpedX % periodA) + periodA) % periodA;
  const distA = Math.abs(posA - periodA * 0.5);
  const laneA = Math.floor(warpedX / periodA);
  const widthA = 1 + Math.floor(seeded01(laneA, Math.floor(y / 190), worldSeed() + 521) * 2); // 1..2
  const segA = Math.floor((y + laneA * 17) / 30);
  const activeA = seeded01(segA, laneA, worldSeed() + 531) > 0.08;
  const ridgeA = distA <= widthA && activeA;

  const periodB = 185;
  const posB = ((warpedY % periodB) + periodB) % periodB;
  const distB = Math.abs(posB - periodB * 0.5);
  const laneB = Math.floor(warpedY / periodB);
  const widthB = 1 + Math.floor(seeded01(laneB, Math.floor(x / 210), worldSeed() + 541) * 2); // 1..2
  const segB = Math.floor((x + laneB * 13) / 32);
  const activeB = seeded01(segB, laneB, worldSeed() + 551) > 0.10;
  const ridgeB = distB <= widthB && activeB;

  const warpedD = x * 0.75 + y * 0.55 + Math.sin((x + y) * 0.006) * 120;
  const periodC = 130;
  const posC = ((warpedD % periodC) + periodC) % periodC;
  const distC = Math.abs(posC - periodC * 0.5);
  const laneC = Math.floor(warpedD / periodC);
  const widthC = 1 + Math.floor(seeded01(laneC, Math.floor((x + y) / 200), worldSeed() + 561) * 2); // 1..2
  const segC = Math.floor((x - y + laneC * 11) / 30);
  const activeC = seeded01(segC, laneC, worldSeed() + 571) > 0.12;
  const ridgeC = distC <= widthC && activeC;

  // Carve predictable mountain passes so ranges create chokepoints/openings.
  const passCell = 28;
  const pgx = Math.floor(x / passCell);
  const pgy = Math.floor(y / passCell);
  const localX = ((x % passCell) + passCell) % passCell;
  const localY = ((y % passCell) + passCell) % passCell;
  const passAxisX = seeded01(pgx, pgy, worldSeed() + 711) > 0.5;
  const passCenter = Math.floor(seeded01(pgx, pgy, worldSeed() + 721) * passCell);
  const passWidth = 3 + Math.floor(seeded01(pgx, pgy, worldSeed() + 731) * 3); // 3..5 tiles
  const passOn = seeded01(pgx, pgy, worldSeed() + 741) > 0.52; // more frequent openings
  const inPass = passAxisX
    ? Math.abs(localX - passCenter) <= passWidth
    : Math.abs(localY - passCenter) <= passWidth;

  const inland = continentField(x, y) > 0.1;
  if (!(inland && (ridgeA || ridgeB || ridgeC))) return false;
  if (passOn && inPass) return false;
  return true;
};

const isMicroMountainRange = (x: number, y: number): boolean => {
  if (continentField(x, y) < 0.11) return false;
  const cell = 18;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  if (seeded01(gx, gy, worldSeed() + 2701) < 0.952) return false;
  const ox = Math.floor(seeded01(gx, gy, worldSeed() + 2702) * cell);
  const oy = Math.floor(seeded01(gx, gy, worldSeed() + 2703) * cell);
  const startX = gx * cell + ox;
  const startY = gy * cell + oy;
  const horizontal = seeded01(gx, gy, worldSeed() + 2704) > 0.5;
  const len = 7 + Math.floor(seeded01(gx, gy, worldSeed() + 2705) * 2); // 7..8
  const width = 1 + Math.floor(seeded01(gx, gy, worldSeed() + 2706) * 2); // 1..2
  if (horizontal) {
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    return dx <= len && dy <= width - 1;
  }
  const dx = Math.abs(x - startX);
  const dy = Math.abs(y - startY);
  return dy <= len && dx <= width - 1;
};

const isMountainCluster = (x: number, y: number): boolean => {
  const cell = 60;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const has = seeded01(gx, gy, worldSeed() + 601) > 0.52;
  if (!has) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, worldSeed() + 602) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, worldSeed() + 603) * cell);
  const r = 3 + Math.floor(seeded01(gx, gy, worldSeed() + 604) * 5);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  return d2 <= r * r && d2 >= (r - 2) * (r - 2);
};

export const terrainAt = (x: number, y: number): Terrain => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);

  const cField = continentField(wx, wy);
  if (cField < 0.075) return "SEA";
  // Keep clear ocean bands between the three continents.
  if (cField < 0.12) return "SEA";
  if (isOceanChannel(wx, wy)) return "SEA";
  if (isRiver(wx, wy)) return "SEA";
  if (isMicroRiver(wx, wy)) return "SEA";
  if (isLake(wx, wy)) return "SEA";

  if (isMountainRange(wx, wy) || isMicroMountainRange(wx, wy) || isMountainCluster(wx, wy)) return "MOUNTAIN";

  return "LAND";
};

export const isCoastalLandAt = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainAt(wx, wy) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(wx, WORLD_WIDTH), wrapY(wy - 1, WORLD_HEIGHT)),
    terrainAt(wrapX(wx + 1, WORLD_WIDTH), wrapY(wy, WORLD_HEIGHT)),
    terrainAt(wrapX(wx, WORLD_WIDTH), wrapY(wy + 1, WORLD_HEIGHT)),
    terrainAt(wrapX(wx - 1, WORLD_WIDTH), wrapY(wy, WORLD_HEIGHT))
  ];
  return n.includes("SEA");
};

export const landBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainAt(wx, wy) !== "LAND") return undefined;
  if (isCoastalLandAt(wx, wy)) return "COASTAL_SAND";
  const biome = valueNoise(wx, wy, 42, worldSeed() + 303);
  return biome > 0.62 ? "SAND" : "GRASS";
};

export const regionTypeAt = (x: number, y: number): RegionType | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainAt(wx, wy) !== "LAND") return undefined;
  const a = valueNoise(wx, wy, 95, worldSeed() + 1403);
  const b = valueNoise(wx + 137, wy + 59, 64, worldSeed() + 1417);
  const c = valueNoise(wx - 83, wy + 191, 140, worldSeed() + 1429);
  const v = a * 0.5 + b * 0.3 + c * 0.2;
  if (v < 0.2) return "FERTILE_PLAINS";
  if (v < 0.4) return "DEEP_FOREST";
  if (v < 0.6) return "BROKEN_HIGHLANDS";
  if (v < 0.8) return "ANCIENT_HEARTLAND";
  return "CRYSTAL_WASTES";
};

export const grassShadeAt = (x: number, y: number): "LIGHT" | "DARK" | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (landBiomeAt(wx, wy) !== "GRASS") return undefined;
  const v = valueNoise(wx, wy, 28, worldSeed() + 99);
  return v < 0.46 ? "DARK" : "LIGHT";
};

export const resourceAt = (x: number, y: number): ResourceType | undefined => {
  // Resource placement is cluster-driven on the server.
  return undefined;
};
