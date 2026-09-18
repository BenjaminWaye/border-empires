// Split out of worldgen.ts (over the repo's 500-line file cap) so this
// didn't push that file over the limit -- same pattern as worldgen-lakes.ts /
// worldgen-oasis.ts / worldgen-island-pruning.ts. Owns mountain-range and
// legacy ocean-channel placement: the sine-warped ridge lanes used by the
// islands style, the tectonic-boundary ranges used by the continents style,
// the shared mountain-pass carving both go through, and the small
// chokepoint-style micro-mountain pop-ups placed on any land tile.
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { boundaryConvergentStressCachedAt, continentField, getInlandThresholds } from "./worldgen-continent-score.js";
import { seeded01, valueNoise } from "./worldgen-noise.js";
import { TAU, worldSeed, worldStyle } from "./worldgen.js";

const toroidDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};
const toroidDy = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_HEIGHT - d);
};

export const isOceanChannel = (x: number, y: number): boolean => {
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

// Kept for islands style only (no tectonic plates there -- see
// worldgen-continent-score.ts's boundaryConvergentStressAt). Independent
// sine-warped ridge lanes, unrelated to coastline/plate shape.
const isSineMountainRange = (x: number, y: number): boolean => {
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

  const inland = continentField(x, y) > getInlandThresholds().mountainRangeInland;
  if (!(inland && (ridgeA || ridgeB || ridgeC))) return false;
  return !isInMountainPass(x, y);
};

// Carve predictable mountain passes so ranges create chokepoints/openings --
// a gameplay need (every range must have crossable gaps), not a geology one,
// so this applies the same way regardless of which range system (sine-warped
// lanes for islands style, tectonic boundaries for continents style) placed
// the surrounding ridge.
export const isInMountainPass = (x: number, y: number): boolean => {
  const passCell = 28;
  const pgx = Math.floor(x / passCell);
  const pgy = Math.floor(y / passCell);
  const localX = ((x % passCell) + passCell) % passCell;
  const localY = ((y % passCell) + passCell) % passCell;
  const passAxisX = seeded01(pgx, pgy, worldSeed() + 711) > 0.5;
  const passCenter = Math.floor(seeded01(pgx, pgy, worldSeed() + 721) * passCell);
  const passWidth = 3 + Math.floor(seeded01(pgx, pgy, worldSeed() + 731) * 3); // 3..5 tiles
  const passOn = seeded01(pgx, pgy, worldSeed() + 741) > 0.52; // more frequent openings
  if (!passOn) return false;
  return passAxisX ? Math.abs(localX - passCenter) <= passWidth : Math.abs(localY - passCenter) <= passWidth;
};

// Continents style: mountain ranges trace tectonic plate boundaries instead
// of independent sine-warped lanes -- a convergent boundary (colliding
// plates) becomes a range following that boundary, the way the Andes hug
// South America's Pacific-plate edge rather than crisscrossing the continent
// arbitrarily. Tuned so ranges read as a real feature (a handful of tiles
// wide along a boundary) without swallowing every inland tile a boundary
// happens to pass near.
const TECTONIC_MOUNTAIN_STRESS_THRESHOLD = 0.32;
const isTectonicMountainRange = (x: number, y: number): boolean => {
  if (continentField(x, y) <= getInlandThresholds().mountainRangeInland) return false;
  if (boundaryConvergentStressCachedAt(x, y) < TECTONIC_MOUNTAIN_STRESS_THRESHOLD) return false;
  return !isInMountainPass(x, y);
};

export const isMountainRange = (x: number, y: number): boolean =>
  worldStyle() === "islands" ? isSineMountainRange(x, y) : isTectonicMountainRange(x, y);

// A small mountain "pop-up" roughly every 10x10 tiles, meant to break sightlines
// and create chokepoints across ordinary land, not just along the big ranges'
// ridgelines. No deep-inland gate: the caller (baseTerrainCodeAt) only reaches
// this once a tile has already cleared the coastal threshold, so any land tile
// -- coastal or interior -- is fair game; requiring "deep inland" here left
// most of a narrow landmass (which is mostly coastal by definition) with no
// pop-ups at all, the opposite of what a chokepoint-every-10-tiles rule needs.
export const isMicroMountainRange = (x: number, y: number): boolean => {
  const cell = 10;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  if (seeded01(gx, gy, worldSeed() + 2701) < 0.55) return false; // ~45% of 10x10 cells get a pop-up
  const ox = Math.floor(seeded01(gx, gy, worldSeed() + 2702) * cell);
  const oy = Math.floor(seeded01(gx, gy, worldSeed() + 2703) * cell);
  const startX = gx * cell + ox;
  const startY = gy * cell + oy;
  const horizontal = seeded01(gx, gy, worldSeed() + 2704) > 0.5;
  const len = 2 + Math.floor(seeded01(gx, gy, worldSeed() + 2705) * 3); // 2..4 -- a small blocking cluster, not a full ridge
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
