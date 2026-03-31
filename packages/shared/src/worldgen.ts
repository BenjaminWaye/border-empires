import type { LandBiome, RegionType, ResourceType, Terrain } from "./types.js";
import { wrapX, wrapY } from "./math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

let CURRENT_WORLD_SEED = 42;
const WORLD_TILE_COUNT = WORLD_WIDTH * WORLD_HEIGHT;
const UNSET_U8 = 255;
const UNSET_I16 = -2;
const TERRAIN_SEA = 0;
const TERRAIN_LAND = 1;
const TERRAIN_MOUNTAIN = 2;
const BIOME_GRASS = 0;
const BIOME_SAND = 1;
const BIOME_COASTAL_SAND = 2;
const BIOME_NONE = UNSET_U8;
const GRASS_DARK = 0;
const GRASS_LIGHT = 1;
const GRASS_NONE = UNSET_U8;
const REGION_FERTILE_PLAINS = 0;
const REGION_DEEP_FOREST = 1;
const REGION_BROKEN_HIGHLANDS = 2;
const REGION_ANCIENT_HEARTLAND = 3;
const REGION_CRYSTAL_WASTES = 4;
const REGION_NONE = UNSET_U8;

const terrainCache = new Uint8Array(WORLD_TILE_COUNT);
const biomeCache = new Uint8Array(WORLD_TILE_COUNT);
const grassShadeCache = new Uint8Array(WORLD_TILE_COUNT);
const regionTypeCache = new Uint8Array(WORLD_TILE_COUNT);
const biomeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
const grassShadeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
const regionTypeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
const continentIndexCache = new Int16Array(WORLD_TILE_COUNT);
const continentScoreCache = new Float32Array(WORLD_TILE_COUNT);

const resetWorldCaches = (): void => {
  terrainCache.fill(UNSET_U8);
  biomeCache.fill(BIOME_NONE);
  grassShadeCache.fill(GRASS_NONE);
  regionTypeCache.fill(REGION_NONE);
  biomeCacheReady.fill(0);
  grassShadeCacheReady.fill(0);
  regionTypeCacheReady.fill(0);
  continentIndexCache.fill(UNSET_I16);
  continentScoreCache.fill(Number.NaN);
};

export const setWorldSeed = (seed: number): void => {
  CURRENT_WORLD_SEED = Math.floor(seed);
  resetWorldCaches();
};
export const getWorldSeed = (): number => CURRENT_WORLD_SEED;
const worldSeed = (): number => CURRENT_WORLD_SEED;
const TAU = Math.PI * 2;
const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;

const encodeTerrain = (terrain: Terrain): number => {
  if (terrain === "LAND") return TERRAIN_LAND;
  if (terrain === "MOUNTAIN") return TERRAIN_MOUNTAIN;
  return TERRAIN_SEA;
};
const decodeTerrain = (terrain: number): Terrain => {
  if (terrain === TERRAIN_LAND) return "LAND";
  if (terrain === TERRAIN_MOUNTAIN) return "MOUNTAIN";
  return "SEA";
};
const terrainCodeAt = (x: number, y: number): number => {
  const idx = worldIndex(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
  const cached = terrainCache[idx] ?? UNSET_U8;
  if (cached !== UNSET_U8) return cached;
  return encodeTerrain(terrainAt(x, y));
};
const encodeBiome = (biome: LandBiome | undefined): number => {
  if (biome === "GRASS") return BIOME_GRASS;
  if (biome === "SAND") return BIOME_SAND;
  if (biome === "COASTAL_SAND") return BIOME_COASTAL_SAND;
  return BIOME_NONE;
};
const decodeBiome = (biome: number): LandBiome | undefined => {
  if (biome === BIOME_GRASS) return "GRASS";
  if (biome === BIOME_SAND) return "SAND";
  if (biome === BIOME_COASTAL_SAND) return "COASTAL_SAND";
  return undefined;
};
const encodeGrassShade = (shade: "LIGHT" | "DARK" | undefined): number => {
  if (shade === "DARK") return GRASS_DARK;
  if (shade === "LIGHT") return GRASS_LIGHT;
  return GRASS_NONE;
};
const decodeGrassShade = (shade: number): "LIGHT" | "DARK" | undefined => {
  if (shade === GRASS_DARK) return "DARK";
  if (shade === GRASS_LIGHT) return "LIGHT";
  return undefined;
};
const encodeRegionType = (region: RegionType | undefined): number => {
  if (region === "FERTILE_PLAINS") return REGION_FERTILE_PLAINS;
  if (region === "DEEP_FOREST") return REGION_DEEP_FOREST;
  if (region === "BROKEN_HIGHLANDS") return REGION_BROKEN_HIGHLANDS;
  if (region === "ANCIENT_HEARTLAND") return REGION_ANCIENT_HEARTLAND;
  if (region === "CRYSTAL_WASTES") return REGION_CRYSTAL_WASTES;
  return REGION_NONE;
};
const decodeRegionType = (region: number): RegionType | undefined => {
  if (region === REGION_FERTILE_PLAINS) return "FERTILE_PLAINS";
  if (region === REGION_DEEP_FOREST) return "DEEP_FOREST";
  if (region === REGION_BROKEN_HIGHLANDS) return "BROKEN_HIGHLANDS";
  if (region === REGION_ANCIENT_HEARTLAND) return "ANCIENT_HEARTLAND";
  if (region === REGION_CRYSTAL_WASTES) return "CRYSTAL_WASTES";
  return undefined;
};

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

const computeContinentScore = (x: number, y: number): { index: number; score: number } => {
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
const continentScore = (x: number, y: number): { index: number; score: number } => {
  const idx = worldIndex(x, y);
  const cachedScore = continentScoreCache[idx] ?? Number.NaN;
  if (!Number.isNaN(cachedScore)) {
    const cachedIndex = continentIndexCache[idx] ?? UNSET_I16;
    return { index: cachedIndex === UNSET_I16 ? -1 : cachedIndex, score: cachedScore };
  }
  const computed = computeContinentScore(x, y);
  continentScoreCache[idx] = computed.score;
  continentIndexCache[idx] = computed.index;
  return computed;
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
  const idx = worldIndex(wx, wy);
  const cached = terrainCache[idx] ?? UNSET_U8;
  if (cached !== UNSET_U8) return decodeTerrain(cached);

  const cField = continentField(wx, wy);
  if (cField < 0.075) {
    terrainCache[idx] = TERRAIN_SEA;
    return "SEA";
  }
  // Keep clear ocean bands between the three continents.
  if (cField < 0.12 || isOceanChannel(wx, wy) || isRiver(wx, wy) || isMicroRiver(wx, wy) || isLake(wx, wy)) {
    terrainCache[idx] = TERRAIN_SEA;
    return "SEA";
  }

  if (isMountainRange(wx, wy) || isMicroMountainRange(wx, wy) || isMountainCluster(wx, wy)) {
    terrainCache[idx] = TERRAIN_MOUNTAIN;
    return "MOUNTAIN";
  }

  terrainCache[idx] = TERRAIN_LAND;
  return "LAND";
};

export const isCoastalLandAt = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) return false;
  return (
    terrainCodeAt(wx, wy - 1) === TERRAIN_SEA ||
    terrainCodeAt(wx + 1, wy) === TERRAIN_SEA ||
    terrainCodeAt(wx, wy + 1) === TERRAIN_SEA ||
    terrainCodeAt(wx - 1, wy) === TERRAIN_SEA
  );
};

export const landBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (biomeCacheReady[idx] === 1) return decodeBiome(biomeCache[idx]!);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) {
    biomeCache[idx] = BIOME_NONE;
    biomeCacheReady[idx] = 1;
    return undefined;
  }
  const region = regionTypeAt(wx, wy);
  let biome: LandBiome;
  if (isCoastalLandAt(wx, wy)) {
    biome = "COASTAL_SAND";
  } else if (region === "DEEP_FOREST") {
    biome = "GRASS";
  } else {
    const macro = valueNoise(wx, wy, 72, worldSeed() + 303);
    const micro = valueNoise(wx - 41, wy + 29, 26, worldSeed() + 317);
    const sandField = macro * 0.7 + micro * 0.3;
    const sandThreshold =
      region === "CRYSTAL_WASTES"
        ? 0.52
        : region === "BROKEN_HIGHLANDS"
          ? 0.58
          : region === "ANCIENT_HEARTLAND"
            ? 0.72
            : 0.78;
    biome = sandField > sandThreshold ? "SAND" : "GRASS";
  }
  biomeCache[idx] = encodeBiome(biome);
  biomeCacheReady[idx] = 1;
  return biome;
};

export const regionTypeAt = (x: number, y: number): RegionType | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (regionTypeCacheReady[idx] === 1) return decodeRegionType(regionTypeCache[idx]!);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) {
    regionTypeCache[idx] = REGION_NONE;
    regionTypeCacheReady[idx] = 1;
    return undefined;
  }
  const a = valueNoise(wx, wy, 180, worldSeed() + 1403);
  const b = valueNoise(wx + 137, wy + 59, 120, worldSeed() + 1417);
  const c = valueNoise(wx - 83, wy + 191, 260, worldSeed() + 1429);
  const v = a * 0.52 + b * 0.28 + c * 0.2;
  const region =
    v < 0.22
      ? "FERTILE_PLAINS"
      : v < 0.36
        ? "DEEP_FOREST"
        : v < 0.58
          ? "BROKEN_HIGHLANDS"
          : v < 0.8
            ? "ANCIENT_HEARTLAND"
            : "CRYSTAL_WASTES";
  regionTypeCache[idx] = encodeRegionType(region);
  regionTypeCacheReady[idx] = 1;
  return region;
};

export const grassShadeAt = (x: number, y: number): "LIGHT" | "DARK" | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (grassShadeCacheReady[idx] === 1) return decodeGrassShade(grassShadeCache[idx]!);
  if (landBiomeAt(wx, wy) !== "GRASS") {
    grassShadeCache[idx] = GRASS_NONE;
    grassShadeCacheReady[idx] = 1;
    return undefined;
  }
  const region = regionTypeAt(wx, wy);
  const macro = valueNoise(wx + 41, wy - 23, 84, worldSeed() + 99);
  const micro = valueNoise(wx - 17, wy + 61, 26, worldSeed() + 109);
  const scatter = valueNoise(wx + 73, wy - 91, 11, worldSeed() + 131);
  const forestField = macro * 0.5 + micro * 0.3 + scatter * 0.2;
  const darkThreshold =
    region === "DEEP_FOREST"
      ? 0.36
      : region === "BROKEN_HIGHLANDS"
        ? 0.24
        : region === "ANCIENT_HEARTLAND"
          ? 0.2
          : 0.16;
  const shade = forestField < darkThreshold ? "DARK" : "LIGHT";
  grassShadeCache[idx] = encodeGrassShade(shade);
  grassShadeCacheReady[idx] = 1;
  return shade;
};

export const resourceAt = (x: number, y: number): ResourceType | undefined => {
  // Resource placement is cluster-driven on the server.
  return undefined;
};
