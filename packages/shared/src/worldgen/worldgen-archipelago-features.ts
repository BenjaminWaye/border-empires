// Two deliberate open-ocean features that don't fall out of the plate/
// coastline-noise system on their own, both requested directly: a dense
// Indonesia-style island chain sitting in open water between continents, and
// isolated ring-shaped atolls (a thin ring of land around a central lagoon).
// Both are additive elevation "stamps" layered onto the plate elevation
// field in worldgen-continent-score.ts, before shorelineRoughnessAt's
// jaggedness multiplier is applied -- so archipelago islands and atoll rings
// still get the same organic, non-rounded coastline texture as everything
// else, for free, instead of needing their own bespoke shape logic.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { seeded01 } from "./worldgen-noise.js";
import { buildPlates } from "./worldgen-plates.js";
import { worldSeed } from "./worldgen.js";

const toroidalDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};
const distTo = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(toroidalDx(ax, bx), ay - by);

// Both zone/atoll centers must sit this far from the nearest CONTINENTAL
// plate center to land solidly in open ocean, not immediately off a
// mainland coast (which would just read as a normal peninsula/bay, not a
// distinct remote island feature).
const MIN_DIST_FROM_CONTINENT = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.16;
const distToNearestContinentalPlate = (x: number, y: number): number => {
  let best = Infinity;
  for (const plate of buildPlates()) {
    if (!plate.isContinental) continue;
    const d = distTo(x, y, plate.cx, plate.cy);
    if (d < best) best = d;
  }
  return best;
};

// --- Archipelago zones (Indonesia-style dense island chains) --------------

const ARCHIPELAGO_ZONE_COUNT = Math.max(1, Math.round(2 * (WORLD_WIDTH / WORLD_HEIGHT)));
const ARCHIPELAGO_ZONE_RADIUS = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.13;
const ZONE_MIN_SPACING = ARCHIPELAGO_ZONE_RADIUS * 2.2;
const ZONE_PLACEMENT_ATTEMPTS = 60;

const ISLANDS_PER_ZONE = 22;
const ISLAND_MIN_SPACING = ARCHIPELAGO_ZONE_RADIUS / 4.5;
const ISLAND_PLACEMENT_ATTEMPTS = 40;
const ISLAND_MIN_RADIUS = 3;
const ISLAND_MAX_RADIUS = 10;
const ISLAND_BUMP_HEIGHT = 0.45;

type IslandSeed = { cx: number; cy: number; radius: number };
type ArchipelagoZone = { cx: number; cy: number; islands: IslandSeed[] };

let cachedZonesSeed = Number.NaN;
let cachedZones: ArchipelagoZone[] = [];

const buildArchipelagoZones = (): ArchipelagoZone[] => {
  const seed = worldSeed();
  if (seed === cachedZonesSeed && cachedZones.length > 0) return cachedZones;
  cachedZonesSeed = seed;

  const zoneCenters: { cx: number; cy: number }[] = [];
  for (let i = 0; i < ARCHIPELAGO_ZONE_COUNT; i += 1) {
    let cx = 0, cy = 0;
    for (let attempt = 0; attempt < ZONE_PLACEMENT_ATTEMPTS; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 310011) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 320022) * WORLD_HEIGHT);
      const farFromContinents = distToNearestContinentalPlate(candX, candY) >= MIN_DIST_FROM_CONTINENT;
      const farFromOtherZones = zoneCenters.every((z) => distTo(candX, candY, z.cx, z.cy) >= ZONE_MIN_SPACING);
      cx = candX;
      cy = candY;
      if ((farFromContinents && farFromOtherZones) || attempt === ZONE_PLACEMENT_ATTEMPTS - 1) break;
    }
    zoneCenters.push({ cx, cy });
  }

  cachedZones = zoneCenters.map((zone, zi) => {
    const islands: IslandSeed[] = [];
    for (let i = 0; i < ISLANDS_PER_ZONE; i += 1) {
      let ix = 0, iy = 0;
      const key = zi * 1000 + i;
      for (let attempt = 0; attempt < ISLAND_PLACEMENT_ATTEMPTS; attempt += 1) {
        // Sample within the zone's disk via polar coordinates, biased
        // slightly toward the center via sqrt so islands don't cluster in a
        // thin ring at the disk's edge.
        const angle = seeded01(key, attempt, seed + 330033) * Math.PI * 2;
        const radius = Math.sqrt(seeded01(key, attempt, seed + 340044)) * ARCHIPELAGO_ZONE_RADIUS;
        const candX = Math.floor(zone.cx + Math.cos(angle) * radius);
        const candY = Math.floor(zone.cy + Math.sin(angle) * radius);
        const farEnough = islands.every((isl) => distTo(candX, candY, isl.cx, isl.cy) >= ISLAND_MIN_SPACING);
        ix = candX;
        iy = candY;
        if (farEnough || attempt === ISLAND_PLACEMENT_ATTEMPTS - 1) break;
      }
      const radius =
        ISLAND_MIN_RADIUS + seeded01(key, 0, seed + 350055) * (ISLAND_MAX_RADIUS - ISLAND_MIN_RADIUS);
      islands.push({ cx: ix, cy: iy, radius });
    }
    return { cx: zone.cx, cy: zone.cy, islands };
  });
  return cachedZones;
};

// Additive elevation contribution: 0 outside every zone's radius, rising
// smoothly (not a hard cliff) as a tile nears one of that zone's island
// seeds, so shorelineRoughnessAt's jaggedness still decides the exact edge.
export const archipelagoBumpAt = (wx: number, wy: number): number => {
  let bump = 0;
  for (const zone of buildArchipelagoZones()) {
    if (distTo(wx, wy, zone.cx, zone.cy) > ARCHIPELAGO_ZONE_RADIUS + ISLAND_MAX_RADIUS) continue;
    for (const island of zone.islands) {
      const d = distTo(wx, wy, island.cx, island.cy);
      if (d >= island.radius) continue;
      const t = 1 - d / island.radius; // 0 at the edge, 1 at the center
      const contribution = ISLAND_BUMP_HEIGHT * t * t;
      if (contribution > bump) bump = contribution;
    }
  }
  return bump;
};

// --- Atolls (ring of land around a central lagoon) -------------------------

const ATOLL_COUNT = Math.max(1, Math.round(1.5 * (WORLD_WIDTH / WORLD_HEIGHT)));
const ATOLL_PLACEMENT_ATTEMPTS = 60;
const ATOLL_MIN_SPACING = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.2;
const ATOLL_OUTER_RADIUS_MIN = 9;
const ATOLL_OUTER_RADIUS_MAX = 15;
const ATOLL_RING_WIDTH = 3.5;
const ATOLL_RING_BUMP_HEIGHT = 0.5;
// Actively pushed down, not just left at ambient ocean elevation, so the
// lagoon reads as real open water even if this exact ocean point happened to
// sample a locally high plate/uplift score.
const ATOLL_LAGOON_DEPRESSION = -0.5;

type Atoll = { cx: number; cy: number; outerRadius: number };

let cachedAtollsSeed = Number.NaN;
let cachedAtolls: Atoll[] = [];

const buildAtolls = (): Atoll[] => {
  const seed = worldSeed();
  if (seed === cachedAtollsSeed && cachedAtolls.length > 0) return cachedAtolls;
  cachedAtollsSeed = seed;

  const zones = buildArchipelagoZones();
  const atolls: Atoll[] = [];
  for (let i = 0; i < ATOLL_COUNT; i += 1) {
    let cx = 0, cy = 0;
    for (let attempt = 0; attempt < ATOLL_PLACEMENT_ATTEMPTS; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 360066) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 370077) * WORLD_HEIGHT);
      const farFromContinents = distToNearestContinentalPlate(candX, candY) >= MIN_DIST_FROM_CONTINENT;
      const farFromZones = zones.every((z) => distTo(candX, candY, z.cx, z.cy) >= ARCHIPELAGO_ZONE_RADIUS * 1.3);
      const farFromOtherAtolls = atolls.every((a) => distTo(candX, candY, a.cx, a.cy) >= ATOLL_MIN_SPACING);
      cx = candX;
      cy = candY;
      if ((farFromContinents && farFromZones && farFromOtherAtolls) || attempt === ATOLL_PLACEMENT_ATTEMPTS - 1) break;
    }
    const outerRadius =
      ATOLL_OUTER_RADIUS_MIN + seeded01(i, 0, seed + 380088) * (ATOLL_OUTER_RADIUS_MAX - ATOLL_OUTER_RADIUS_MIN);
    atolls.push({ cx, cy, outerRadius });
  }
  cachedAtolls = atolls;
  return cachedAtolls;
};

// Additive elevation contribution shaped like a ring: strongly positive in
// an annulus near outerRadius (the reef/land ring), strongly negative inside
// it (the lagoon), and zero beyond it (open ocean).
export const atollBumpAt = (wx: number, wy: number): number => {
  let bump = 0;
  for (const atoll of buildAtolls()) {
    const d = distTo(wx, wy, atoll.cx, atoll.cy);
    if (d > atoll.outerRadius + 1) continue;
    const innerRadius = atoll.outerRadius - ATOLL_RING_WIDTH;
    if (d < innerRadius) {
      bump += ATOLL_LAGOON_DEPRESSION;
    } else {
      // Peaks at the ring's midline, falling off toward both the lagoon and
      // open ocean edges of the ring.
      const ringMid = (innerRadius + atoll.outerRadius) / 2;
      const ringHalfWidth = (atoll.outerRadius - innerRadius) / 2;
      const t = Math.max(0, 1 - Math.abs(d - ringMid) / ringHalfWidth);
      bump += ATOLL_RING_BUMP_HEIGHT * t;
    }
  }
  return bump;
};
