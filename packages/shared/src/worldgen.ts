import type { ResourceType, Terrain } from "./types.js";
import { wrapX, wrapY } from "./math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

const WORLD_SEED = 42;
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

type ContinentSeed = { cx: number; cy: number; rx: number; ry: number; wobble: number };
const continents: ContinentSeed[] = (() => {
  const out: ContinentSeed[] = [];
  const count = 5;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + seeded01(i * 19, i * 23, WORLD_SEED + 101) * 0.45;
    const ringX = WORLD_WIDTH * 0.22;
    const ringY = WORLD_HEIGHT * 0.18;
    const cx = wrapX(Math.floor(WORLD_WIDTH * 0.5 + Math.cos(angle) * ringX), WORLD_WIDTH);
    const cy = wrapY(Math.floor(WORLD_HEIGHT * 0.5 + Math.sin(angle) * ringY), WORLD_HEIGHT);
    out.push({
      cx,
      cy,
      rx: 250 + Math.floor(seeded01(i * 31, i * 37, WORLD_SEED + 111) * 90),
      ry: 205 + Math.floor(seeded01(i * 41, i * 43, WORLD_SEED + 121) * 85),
      wobble: seeded01(i * 47, i * 53, WORLD_SEED + 131) * TAU
    });
  }
  return out;
})();

const continentField = (x: number, y: number): number => {
  let best = 0;
  for (const c of continents) {
    const dx = toroidDx(x, c.cx);
    const dy = toroidDy(y, c.cy);
    const nx = dx / c.rx;
    const ny = dy / c.ry;
    const base = 1 - Math.sqrt(nx * nx + ny * ny);
    if (base <= 0) continue;
    const wobbleNoise = valueNoise(x + c.cx, y + c.cy, 420, WORLD_SEED + 210);
    const wobble = 1 + (wobbleNoise - 0.5) * 0.35 + Math.sin((x + y) * 0.0009 + c.wobble) * 0.08;
    const score = base * wobble;
    if (score > best) best = score;
  }
  return best;
};

const isOceanChannel = (x: number, y: number): boolean => {
  const yn = y / WORLD_HEIGHT;
  const xn = x / WORLD_WIDTH;

  // Narrow channels; max width around 80 (2*40).
  const c1 = WORLD_WIDTH * 0.33 + Math.sin(yn * TAU * 1.4 + 0.4) * 70 + Math.sin(yn * TAU * 3.2) * 24;
  const c2 = WORLD_WIDTH * 0.67 + Math.sin(yn * TAU * 1.25 + 2.0) * 65 + Math.sin(yn * TAU * 2.9 + 1.4) * 22;
  const r1 = WORLD_HEIGHT * 0.57 + Math.sin(xn * TAU * 1.2 + 1.1) * 62 + Math.sin(xn * TAU * 2.6 + 0.3) * 20;

  const w1 = 8 + Math.floor(valueNoise(x, y, 320, WORLD_SEED + 241) * 14); // 8..22
  const w2 = 8 + Math.floor(valueNoise(x, y, 280, WORLD_SEED + 251) * 14); // 8..22
  const w3 = 8 + Math.floor(valueNoise(x, y, 300, WORLD_SEED + 261) * 12); // 8..20

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
  return WORLD_WIDTH * 0.35 + Math.sin(yn * TAU * 1.7 + 1.1) * 40 + Math.sin(yn * TAU * 3.9) * 12;
};

const isRiver = (x: number, y: number): boolean => {
  const cField = continentField(x, y);
  if (cField < 0.07) return false;
  for (let i = 0; i < 8; i += 1) {
    const cx = wrapX(Math.floor(riverCenterX(y, i)), WORLD_WIDTH);
    const width = 1 + Math.floor(valueNoise(x + i * 113, y, 140, WORLD_SEED + 75 + i) * 2); // 1..2 tiles
    const lane = Math.floor((y + i * 19) / 50); // ~50-tile strip segments
    const active = seeded01(lane, i, WORLD_SEED + 332) > 0.28;
    if (active && toroidDx(x, cx) <= width) return true;
  }
  return false;
};

const isLake = (x: number, y: number): boolean => {
  if (continentField(x, y) < 0.09) return false;
  const cell = 52;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const hasLake = seeded01(gx, gy, WORLD_SEED + 71) > 0.89;
  if (!hasLake) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, WORLD_SEED + 72) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, WORLD_SEED + 73) * cell);
  const r = 2 + Math.floor(seeded01(gx, gy, WORLD_SEED + 74) * 6);
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
  const widthA = 1 + Math.floor(seeded01(laneA, Math.floor(y / 190), WORLD_SEED + 521) * 2); // 1..2
  const segA = Math.floor((y + laneA * 17) / 30);
  const activeA = seeded01(segA, laneA, WORLD_SEED + 531) > 0.28;
  const ridgeA = distA <= widthA && activeA;

  const periodB = 185;
  const posB = ((warpedY % periodB) + periodB) % periodB;
  const distB = Math.abs(posB - periodB * 0.5);
  const laneB = Math.floor(warpedY / periodB);
  const widthB = 1 + Math.floor(seeded01(laneB, Math.floor(x / 210), WORLD_SEED + 541) * 2); // 1..2
  const segB = Math.floor((x + laneB * 13) / 32);
  const activeB = seeded01(segB, laneB, WORLD_SEED + 551) > 0.34;
  const ridgeB = distB <= widthB && activeB;

  const warpedD = x * 0.75 + y * 0.55 + Math.sin((x + y) * 0.006) * 120;
  const periodC = 130;
  const posC = ((warpedD % periodC) + periodC) % periodC;
  const distC = Math.abs(posC - periodC * 0.5);
  const laneC = Math.floor(warpedD / periodC);
  const widthC = 1 + Math.floor(seeded01(laneC, Math.floor((x + y) / 200), WORLD_SEED + 561) * 2); // 1..2
  const segC = Math.floor((x - y + laneC * 11) / 30);
  const activeC = seeded01(segC, laneC, WORLD_SEED + 571) > 0.38;
  const ridgeC = distC <= widthC && activeC;

  // Keep ranges mostly inland to preserve coast readability.
  const inland = continentField(x, y) > 0.12;
  return inland && (ridgeA || ridgeB || ridgeC);
};

const isMountainCluster = (x: number, y: number): boolean => {
  const cell = 60;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const has = seeded01(gx, gy, WORLD_SEED + 601) > 0.74;
  if (!has) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, WORLD_SEED + 602) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, WORLD_SEED + 603) * cell);
  const r = 3 + Math.floor(seeded01(gx, gy, WORLD_SEED + 604) * 5);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  return d2 <= r * r && d2 >= (r - 2) * (r - 2);
};

export const terrainAt = (x: number, y: number): Terrain => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);

  const cField = continentField(wx, wy);
  if (cField < 0.006) return "SEA";
  if (cField < 0.09 && isOceanChannel(wx, wy)) return "SEA";
  if (isRiver(wx, wy)) return "SEA";
  if (isLake(wx, wy)) return "SEA";

  if (isMountainRange(wx, wy) || isMountainCluster(wx, wy)) return "MOUNTAIN";

  return "LAND";
};

export const resourceAt = (x: number, y: number): ResourceType | undefined => {
  const t = terrainAt(x, y);
  if (t !== "LAND") return undefined;

  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const v = seeded01(wx, wy, WORLD_SEED + 77);
  if (v < 0.08) return "FARM";
  if (v < 0.11) return "WOOD";
  if (v < 0.125) return "IRON";
  if (v < 0.13) return "GEMS";
  return undefined;
};
