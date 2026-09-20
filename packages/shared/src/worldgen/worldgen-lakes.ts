// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// v1-v4: every lake was a plain circle (see the legacy branch below) --
// same 52-tile grid, same existence roll, but zero shape variety. v5 picks
// one of three shape kinds per candidate (round, elongated, wandering) so
// lakes actually read as distinct places instead of one repeated stamp.
// Legacy behavior is kept byte-for-byte under worldgenVersion < 5 so
// already-running seasons don't have their coastline silently redrawn.
//
// Unlike the legacy version, candidates are searched across the 3x3
// neighborhood of grid cells around (x, y) (the same pattern as
// isHighlandsClusterAt/meadowRingAt) so a shape doesn't get clipped at its
// own cell's boundary -- the elongated/wandering shapes can be wider than
// the 52-tile cell.
import { seeded01 } from "./worldgen-noise.js";

// Perturbs a circle/ellipse's radius by angle using two sine harmonics with
// randomized amplitude/frequency/phase per candidate -- a cheap way to turn
// a mathematically perfect circle into an organic, irregular-shored blob
// (the same idea as isMountainRange's coordinate warping, applied in polar
// form instead). Returns a multiplier applied to the base radius.
const organicWobble = (angle: number, gx: number, gy: number, seed: number, offset: number): number => {
  const amp1 = 0.16 + seeded01(gx, gy, seed + offset) * 0.14; // 0.16..0.30
  const freq1 = 2 + Math.floor(seeded01(gx, gy, seed + offset + 1) * 2); // 2..3
  const phase1 = seeded01(gx, gy, seed + offset + 2) * Math.PI * 2;
  const amp2 = 0.06 + seeded01(gx, gy, seed + offset + 3) * 0.1; // 0.06..0.16
  const freq2 = 4 + Math.floor(seeded01(gx, gy, seed + offset + 4) * 3); // 4..6
  const phase2 = seeded01(gx, gy, seed + offset + 5) * Math.PI * 2;
  return 1 + amp1 * Math.sin(angle * freq1 + phase1) + amp2 * Math.sin(angle * freq2 + phase2);
};
// Worst-case multiplier the wobble above can produce, for perimeter-safety
// checks that need an upper bound on how far a wobbled shape can reach.
const MAX_WOBBLE = 1 + 0.3 + 0.16;

const LAKE_CELL = 52;
const LEGACY_LAKE_CHANCE = 0.89; // legacy threshold: seeded01(...) > this rolls a lake
// v5 lakes were barely noticeable at the legacy rarity/size (a handful of
// 4-18 tile blobs across the whole map) -- raised so they read as an actual
// map feature instead of something you have to go looking for.
const LAKE_CHANCE = 0.72; // ~28% of cells roll a lake
const LAKE_CANDIDATES_PER_CELL = 12;

const legacyIsLakeAt = (x: number, y: number, seed: number): boolean => {
  const gx = Math.floor(x / LAKE_CELL);
  const gy = Math.floor(y / LAKE_CELL);
  if (seeded01(gx, gy, seed + 71) <= LEGACY_LAKE_CHANCE) return false;
  const cx = gx * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 72) * LAKE_CELL);
  const cy = gy * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 73) * LAKE_CELL);
  const r = 2 + Math.floor(seeded01(gx, gy, seed + 74) * 6);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

type LakeShape = "ROUND" | "ELONGATED" | "WANDERING";

const lakeShapeFor = (gx: number, gy: number, seed: number): LakeShape => {
  const roll = seeded01(gx, gy, seed + 75);
  if (roll < 0.4) return "ROUND";
  if (roll < 0.75) return "ELONGATED";
  return "WANDERING";
};

// Extremity-only half of isInRoundLake/isInElongatedLake below, split out so
// resolveLakeCell can check whether a candidate center's shape fits entirely
// on land once per cell, without also needing a query tile (x, y) to do it.
const isRoundLakeExtremitiesInland = (
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  const r = 4 + Math.floor(seeded01(gx, gy, seed + 74) * 8); // 4..11 -- a perfect circle reads as artificial past this size, so wobble carries the rest of the visual size
  const maxR = r * MAX_WOBBLE;
  return isInland(cx + maxR, cy) && isInland(cx - maxR, cy) && isInland(cx, cy + maxR) && isInland(cx, cy - maxR);
};

// Checks a handful of points on the shape's own perimeter (not just its
// center) against isInland -- a big round/elongated lake can still poke
// into the coast even when its center reads as solidly inland.
const isInRoundLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  if (!isRoundLakeExtremitiesInland(cx, cy, gx, gy, seed, isInland)) return false;
  const r = 4 + Math.floor(seeded01(gx, gy, seed + 74) * 8);
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return true;
  const wobbled = r * organicWobble(Math.atan2(dy, dx), gx, gy, seed, 84);
  return dist <= wobbled;
};

const isElongatedLakeExtremitiesInland = (
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  const angle = seeded01(gx, gy, seed + 76) * Math.PI;
  const semiMajor = 11 + seeded01(gx, gy, seed + 77) * 12; // 11..23
  const semiMinor = 4 + seeded01(gx, gy, seed + 78) * 5; // 4..9
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const maxMajor = semiMajor * MAX_WOBBLE;
  const maxMinor = semiMinor * MAX_WOBBLE;
  const majorEndA = [cx + ca * maxMajor, cy + sa * maxMajor] as const;
  const majorEndB = [cx - ca * maxMajor, cy - sa * maxMajor] as const;
  const minorEndA = [cx - sa * maxMinor, cy + ca * maxMinor] as const;
  const minorEndB = [cx + sa * maxMinor, cy - ca * maxMinor] as const;
  return (
    isInland(...majorEndA) && isInland(...majorEndB) && isInland(...minorEndA) && isInland(...minorEndB)
  );
};

const isInElongatedLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  if (!isElongatedLakeExtremitiesInland(cx, cy, gx, gy, seed, isInland)) return false;
  const angle = seeded01(gx, gy, seed + 76) * Math.PI;
  const semiMajor = 11 + seeded01(gx, gy, seed + 77) * 12;
  const semiMinor = 4 + seeded01(gx, gy, seed + 78) * 5;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  const rx = dx * ca + dy * sa;
  const ry = -dx * sa + dy * ca;
  const wobble = organicWobble(Math.atan2(ry, rx), gx, gy, seed, 90);
  const wobbledMajor = semiMajor * wobble;
  const wobbledMinor = semiMinor * wobble;
  return (rx * rx) / (wobbledMajor * wobbledMajor) + (ry * ry) / (wobbledMinor * wobbledMinor) <= 1;
};

// Walks the same step chain isInWanderingLake below does (deterministic from
// gx/gy/seed alone, independent of any query tile) purely to check every
// step stays inland, so resolveLakeCell can validate a WANDERING candidate
// once per cell instead of re-deriving this per tile query.
const isWanderingLakeStepsInland = (
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isStepInland: (px: number, py: number) => boolean
): boolean => {
  let px = cx;
  let py = cy;
  let heading = seeded01(gx, gy, seed + 79) * Math.PI * 2;
  const steps = 4 + Math.floor(seeded01(gx, gy, seed + 80) * 2); // 4..5
  for (let i = 0; i < steps; i++) {
    if (!isStepInland(px, py)) return false;
    const stepLen = 7 + seeded01(gx, gy, seed + 82 + i * 3) * 5; // 7..12
    heading += (seeded01(gx, gy, seed + 83 + i * 3) - 0.5) * (Math.PI * 0.6); // wander +-54 deg
    px += Math.cos(heading) * stepLen;
    py += Math.sin(heading) * stepLen;
  }
  return true;
};

// A short chain of overlapping circles walked in a jittered direction --
// reads as a bendy, organic lake rather than a stamped ellipse. Each step's
// center must itself pass the inland check (via isStepInland) or the walk
// stops there, so the chain can't wander out to the coast even though its
// direction is randomized.
const isInWanderingLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isStepInland: (px: number, py: number) => boolean
): boolean => {
  let px = cx;
  let py = cy;
  let heading = seeded01(gx, gy, seed + 79) * Math.PI * 2;
  const steps = 4 + Math.floor(seeded01(gx, gy, seed + 80) * 2); // 4..5
  for (let i = 0; i < steps; i++) {
    if (!isStepInland(px, py)) return false;
    const r = 3 + seeded01(gx, gy, seed + 81 + i * 3) * 4; // 3..7
    const dx = x - px;
    const dy = y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0 || dist <= r * organicWobble(Math.atan2(dy, dx), gx, gy, seed, 200 + i * 10)) return true;
    const stepLen = 7 + seeded01(gx, gy, seed + 82 + i * 3) * 5; // 7..12
    heading += (seeded01(gx, gy, seed + 83 + i * 3) - 0.5) * (Math.PI * 0.6); // wander +-54 deg
    px += Math.cos(heading) * stepLen;
    py += Math.sin(heading) * stepLen;
  }
  return false;
};

type LakeCandidate = { cx: number; cy: number; shape: LakeShape };

// Resolving a cell tries up to LAKE_CANDIDATES_PER_CELL candidate centers,
// each requiring several extremity points to also clear isInland -- too
// expensive to redo on every tile query (isLakeAt runs from baseTerrainCodeAt,
// i.e. potentially once per tile on the map, and checks a 3x3 block of cells
// each time). Cache every extremities-valid candidate for a cell (not just
// the first) per seed/threshold instead, so the search runs once per cell:
// a query tile still needs to try each cached candidate in order and take
// the first one that actually contains it, matching the original per-tile
// behavior where a later, closer candidate could satisfy a query even when
// an earlier one's extremities were fine but it didn't reach that tile.
let lakeCellCacheKey = "";
const lakeCellCache = new Map<string, LakeCandidate[]>();

const resolveLakeCandidates = (
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): LakeCandidate[] => {
  const key = `${gx},${gy}`;
  const cached = lakeCellCache.get(key);
  if (cached !== undefined) return cached;
  const candidates: LakeCandidate[] = [];
  if (seeded01(gx, gy, seed + 71) > LAKE_CHANCE) {
    const shape = lakeShapeFor(gx, gy, seed);
    // A shape's extremities (up to ~23 tiles out for ELONGATED) must also
    // clear isInland, not just its center -- with more fragmented coastlines
    // a single fixed candidate center rarely has enough contiguous inland
    // room for that. Try several candidate centers within the same cell
    // (same shape kind/size, from the same gx/gy/seed -- only the center
    // position changes) rather than giving up on the cell after one miss.
    for (let attempt = 0; attempt < LAKE_CANDIDATES_PER_CELL; attempt += 1) {
      const salt = attempt * 53;
      const cx = gx * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 72 + salt) * LAKE_CELL);
      const cy = gy * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 73 + salt) * LAKE_CELL);
      if (!isInland(cx, cy)) continue;
      const extremitiesOk =
        shape === "ROUND"
          ? isRoundLakeExtremitiesInland(cx, cy, gx, gy, seed, isInland)
          : shape === "ELONGATED"
            ? isElongatedLakeExtremitiesInland(cx, cy, gx, gy, seed, isInland)
            : isWanderingLakeStepsInland(cx, cy, gx, gy, seed, isInland);
      if (extremitiesOk) candidates.push({ cx, cy, shape });
    }
  }
  lakeCellCache.set(key, candidates);
  return candidates;
};

export const isLakeAt = (
  x: number,
  y: number,
  seed: number,
  version: number,
  continentFieldAt: (x: number, y: number) => number,
  // A lake candidate never spawns unless its center reads as solidly inland
  // (well above the sea/coastal threshold baseTerrainCodeAt itself uses) --
  // otherwise the shape just extends the coastline into a bay/inlet that
  // merges with the open ocean instead of reading as a separate lake. Passed
  // in (rather than a fixed constant) because it's calibrated per seed/style.
  inlandThreshold: number
): boolean => {
  if (version < 5) return legacyIsLakeAt(x, y, seed);
  const cacheKey = `${seed}:${inlandThreshold}`;
  if (cacheKey !== lakeCellCacheKey) {
    lakeCellCacheKey = cacheKey;
    lakeCellCache.clear();
  }
  const gx0 = Math.floor(x / LAKE_CELL);
  const gy0 = Math.floor(y / LAKE_CELL);
  const isInland = (px: number, py: number): boolean => continentFieldAt(px, py) >= inlandThreshold;
  for (let dgy = -1; dgy <= 1; dgy++) {
    for (let dgx = -1; dgx <= 1; dgx++) {
      const gx = gx0 + dgx;
      const gy = gy0 + dgy;
      for (const { cx, cy, shape } of resolveLakeCandidates(gx, gy, seed, isInland)) {
        if (shape === "ROUND" && isInRoundLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
        if (shape === "ELONGATED" && isInElongatedLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
        if (shape === "WANDERING" && isInWanderingLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
      }
    }
  }
  return false;
};
