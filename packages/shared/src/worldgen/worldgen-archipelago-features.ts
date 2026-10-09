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
import { naturalAtollBump, naturalAtollShape, type AtollShape } from "./worldgen-atoll-shape.js";
import { isOceanicPlateAt, offshoreMarginAt } from "./worldgen-continent-score.js";
import { chainIslandBump, CHAIN_REACH, layOutIslandChain, type ChainIsland } from "./worldgen-island-chain.js";
import { POLAR_BAND, worldSeed } from "./worldgen.js";
import { continentSeparationActive, worldgenVersion } from "./worldgen-version.js";

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

// v10+: continental plates cover most of the map (see worldgen-plates.ts),
// so "far from every continental plate CENTRE" is rarely satisfiable and
// placement fell back to its last random attempt -- dropping atoll rings and
// lagoons into the middle of continents. Instead a feature must sit wholly in
// open ocean: its centre and a ring of points around it all on oceanic
// plates, clear of the polar bands. If no attempt qualifies, it is skipped.
const OPEN_OCEAN_RING_SAMPLES = 12;
const POLAR_CLEARANCE = 12;
const isOpenOceanSite = (x: number, y: number, radius: number, deepOnly = false): boolean => {
  if (y - radius < POLAR_BAND + POLAR_CLEARANCE || y + radius >= WORLD_HEIGHT - POLAR_BAND - POLAR_CLEARANCE) return false;
  if (!isOceanicPlateAt(x, y, deepOnly)) return false;
  for (let i = 0; i < OPEN_OCEAN_RING_SAMPLES; i += 1) {
    const a = (i / OPEN_OCEAN_RING_SAMPLES) * Math.PI * 2;
    const sx = (Math.round(x + Math.cos(a) * radius) + WORLD_WIDTH) % WORLD_WIDTH;
    if (!isOceanicPlateAt(sx, Math.round(y + Math.sin(a) * radius), deepOnly)) return false;
  }
  return true;
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
// v10+: continental plates cover more of the map, so the calibrated sea
// threshold sits higher (~0.4-0.63 vs ~0.25-0.3) and the old bumps no longer
// lift these features above water. Island/atoll land must clear it.
const ISLAND_BUMP_HEIGHT_V10 = 0.8;

type IslandSeed = { cx: number; cy: number; radius: number };
type ArchipelagoZone = { cx: number; cy: number; islands: IslandSeed[]; chain?: ChainIsland[] };

// v10+: island chains sit in the offshore seas along a continent -- between
// these offshore margins (plate-distance units, ~5-35 tiles off the plate
// boundary) -- never in mid-ocean, and each island stays off the continent
// itself. See worldgen-island-chain.ts.
const CHAIN_MARGIN_MIN = 12;
const CHAIN_MARGIN_MAX = 60;
const CHAIN_ISLAND_MIN_MARGIN = 6;
const CHAIN_MIN_ISLANDS = 4;
const CHAIN_PLACEMENT_ATTEMPTS = 300;

// The chain runs parallel to the nearby coast: perpendicular to the
// direction in which the offshore margin grows.
const coastParallelDirection = (x: number, y: number, fallback: number): number => {
  const m = (dx: number, dy: number): number => offshoreMarginAt((x + dx + WORLD_WIDTH) % WORLD_WIDTH, y + dy);
  const gx = m(4, 0) - m(-4, 0);
  const gy = m(0, 4) - m(0, -4);
  if (Math.hypot(gx, gy) < 1e-6) return fallback;
  return Math.atan2(gy, gx) + Math.PI / 2;
};

const buildIslandChainZones = (seed: number): ArchipelagoZone[] => {
  const zones: ArchipelagoZone[] = [];
  for (let i = 0; i < ARCHIPELAGO_ZONE_COUNT; i += 1) {
    for (let attempt = 0; attempt < CHAIN_PLACEMENT_ATTEMPTS; attempt += 1) {
      const cx = Math.floor(seeded01(i, attempt, seed + 310011) * WORLD_WIDTH);
      const cy = Math.floor(seeded01(i, attempt, seed + 320022) * WORLD_HEIGHT);
      if (zones.some((z) => distTo(cx, cy, z.cx, z.cy) < ZONE_MIN_SPACING)) continue;
      const margin = offshoreMarginAt(cx, cy);
      if (margin < CHAIN_MARGIN_MIN || margin > CHAIN_MARGIN_MAX) continue;
      const direction = coastParallelDirection(cx, cy, seeded01(i, attempt, seed + 330033) * Math.PI);
      const chain = layOutIslandChain(i * 1000 + attempt, seed, cx, cy, direction).filter(
        (isl) =>
          isl.cy > POLAR_BAND + 6 &&
          isl.cy < WORLD_HEIGHT - POLAR_BAND - 6 &&
          offshoreMarginAt((Math.round(isl.cx) + WORLD_WIDTH) % WORLD_WIDTH, Math.round(isl.cy)) >= CHAIN_ISLAND_MIN_MARGIN
      );
      if (chain.length < CHAIN_MIN_ISLANDS) continue;
      zones.push({ cx, cy, islands: [], chain });
      break;
    }
  }
  return zones;
};

let cachedZonesSeed = Number.NaN;
// Keyed on version too: placement avoids continental plates, which v10 changes.
let cachedZonesVersion: number | undefined;
let cachedZones: ArchipelagoZone[] = [];

const buildArchipelagoZones = (): ArchipelagoZone[] => {
  const seed = worldSeed();
  const version = worldgenVersion();
  if (seed === cachedZonesSeed && version === cachedZonesVersion) return cachedZones;
  cachedZonesSeed = seed;
  cachedZonesVersion = version;

  const openOceanOnly = continentSeparationActive();
  if (openOceanOnly) {
    cachedZones = buildIslandChainZones(seed);
    return cachedZones;
  }
  const zoneCenters: { cx: number; cy: number }[] = [];
  for (let i = 0; i < ARCHIPELAGO_ZONE_COUNT; i += 1) {
    let cx = 0, cy = 0;
    let placed = false;
    for (let attempt = 0; attempt < ZONE_PLACEMENT_ATTEMPTS; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 310011) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 320022) * WORLD_HEIGHT);
      const farFromOtherZones = zoneCenters.every((z) => distTo(candX, candY, z.cx, z.cy) >= ZONE_MIN_SPACING);
      cx = candX;
      cy = candY;
      if (openOceanOnly) {
        if (farFromOtherZones && isOpenOceanSite(candX, candY, ARCHIPELAGO_ZONE_RADIUS * 0.5)) {
          placed = true;
          break;
        }
        continue;
      }
      const farFromContinents = distToNearestContinentalPlate(candX, candY) >= MIN_DIST_FROM_CONTINENT;
      placed = true;
      if ((farFromContinents && farFromOtherZones) || attempt === ZONE_PLACEMENT_ATTEMPTS - 1) break;
    }
    if (placed) zoneCenters.push({ cx, cy });
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
    if (zone.chain) {
      // v10+: island chain, sampled on the raw tile -- see worldgen-island-chain.ts.
      const zdx = ((wx - zone.cx + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2;
      if (Math.abs(zdx) > CHAIN_REACH || Math.abs(wy - zone.cy) > CHAIN_REACH) continue;
      for (const island of zone.chain) {
        const dx = ((wx - island.cx + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2;
        const contribution = chainIslandBump(dx, wy - island.cy, island, ISLAND_BUMP_HEIGHT_V10);
        if (contribution > bump) bump = contribution;
      }
      continue;
    }
    if (distTo(wx, wy, zone.cx, zone.cy) > ARCHIPELAGO_ZONE_RADIUS + ISLAND_MAX_RADIUS) continue;
    for (const island of zone.islands) {
      const d = distTo(wx, wy, island.cx, island.cy);
      if (d >= island.radius) continue;
      const t = 1 - d / island.radius; // 0 at the edge, 1 at the center
      const contribution = (continentSeparationActive() ? ISLAND_BUMP_HEIGHT_V10 : ISLAND_BUMP_HEIGHT) * t * t;
      if (contribution > bump) bump = contribution;
    }
  }
  return bump;
};

// --- Atolls (ring of land around a central lagoon) -------------------------

const ATOLL_COUNT = Math.max(1, Math.round(1.5 * (WORLD_WIDTH / WORLD_HEIGHT)));
const ATOLL_PLACEMENT_ATTEMPTS = 60;
// v10's open-water rule rejects most random sites, so it gets more tries.
const ATOLL_PLACEMENT_ATTEMPTS_V10 = 400;
const ATOLL_MIN_SPACING = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.2;
const ATOLL_OUTER_RADIUS_MIN = 9;
const ATOLL_OUTER_RADIUS_MAX = 15;
const ATOLL_RING_WIDTH = 3.5;
const ATOLL_RING_BUMP_HEIGHT = 0.5;
const ATOLL_RING_BUMP_HEIGHT_V10 = 0.85;
// Open water required beyond the ring. v10 coasts can reach right up to a
// continental plate's boundary (shelf + coast detail), so the plate check
// must look well past the ring or the atoll fuses with a nearby coast --
// including the fine coast displacement (up to ~8.5 tiles, see
// coastDisplacementAt) the plate check itself doesn't apply.
const ATOLL_OPEN_WATER_MARGIN = 22;
const COMPANION_OPEN_WATER_MARGIN = 14;
// Actively pushed down, not just left at ambient ocean elevation, so the
// lagoon reads as real open water even if this exact ocean point happened to
// sample a locally high plate/uplift score.
const ATOLL_LAGOON_DEPRESSION = -0.5;
// v10+: realistic scale. A tile is ~60 km at Earth scale (640 tiles round),
// so the legacy 9-15 tile radius made every atoll ~1,100-1,900 km across --
// the size of a small continent. Real atolls are 5-30 km (the largest ~100
// km); a few tiles across is the smallest that still reads as a ring with a
// lagoon. Companions make the small Maldives/Tuamotu-style clusters real
// atolls come in.
const ATOLL_OUTER_RADIUS_MIN_V10 = 4;
const ATOLL_OUTER_RADIUS_MAX_V10 = 6;
const COMPANION_RADIUS_MIN = 2.5;
const COMPANION_RADIUS_MAX = 3.5;
const COMPANION_MAX = 2;

type Atoll = { cx: number; cy: number; outerRadius: number; shape?: AtollShape };

let cachedAtollsSeed = Number.NaN;
// Keyed on version too: placement avoids continental plates, which v10 changes.
let cachedAtollsVersion: number | undefined;
let cachedAtolls: Atoll[] = [];

// 0-2 smaller atolls a short way off a v10 atoll, each only where it still
// sits in deep open water and clear of every other atoll.
const placeCompanions = (atolls: Atoll[], i: number, cx: number, cy: number, outerRadius: number, seed: number): void => {
  const count = Math.floor(seeded01(i, 50, seed + 392002) * (COMPANION_MAX + 1));
  for (let c = 1; c <= count; c += 1) {
    const r = (salt: number): number => seeded01(i * 10 + c, salt, seed + 393003);
    const radius = COMPANION_RADIUS_MIN + r(1) * (COMPANION_RADIUS_MAX - COMPANION_RADIUS_MIN);
    const angle = r(2) * Math.PI * 2;
    const dist = outerRadius + radius + 4 + r(3) * 6;
    const x = (Math.round(cx + Math.cos(angle) * dist) + WORLD_WIDTH) % WORLD_WIDTH;
    const y = Math.round(cy + Math.sin(angle) * dist);
    const clear = atolls.every((a) => distTo(x, y, a.cx, a.cy) >= a.outerRadius * 1.5 + radius + 3);
    if (clear && isOpenOceanSite(x, y, radius + COMPANION_OPEN_WATER_MARGIN, true)) {
      atolls.push({ cx: x, cy: y, outerRadius: radius, shape: naturalAtollShape(i * 10 + c, seed) });
    }
  }
};

const buildAtolls = (): Atoll[] => {
  const seed = worldSeed();
  const version = worldgenVersion();
  if (seed === cachedAtollsSeed && version === cachedAtollsVersion) return cachedAtolls;
  cachedAtollsSeed = seed;
  cachedAtollsVersion = version;

  const zones = buildArchipelagoZones();
  const openOceanOnly = continentSeparationActive();
  const atolls: Atoll[] = [];
  for (let i = 0; i < ATOLL_COUNT; i += 1) {
    let cx = 0, cy = 0;
    let placed = false;
    const sizeRoll = seeded01(i, 0, seed + 380088);
    const outerRadius = openOceanOnly
      ? ATOLL_OUTER_RADIUS_MIN_V10 + sizeRoll * (ATOLL_OUTER_RADIUS_MAX_V10 - ATOLL_OUTER_RADIUS_MIN_V10)
      : ATOLL_OUTER_RADIUS_MIN + sizeRoll * (ATOLL_OUTER_RADIUS_MAX - ATOLL_OUTER_RADIUS_MIN);
    const attempts = openOceanOnly ? ATOLL_PLACEMENT_ATTEMPTS_V10 : ATOLL_PLACEMENT_ATTEMPTS;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 360066) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 370077) * WORLD_HEIGHT);
      const farFromZones = zones.every((z) => distTo(candX, candY, z.cx, z.cy) >= ARCHIPELAGO_ZONE_RADIUS * 1.3);
      const farFromOtherAtolls = atolls.every((a) => distTo(candX, candY, a.cx, a.cy) >= ATOLL_MIN_SPACING);
      cx = candX;
      cy = candY;
      if (openOceanOnly) {
        // A clear margin of open water beyond the ring, so it reads as a remote
        // atoll -- including clear of a zone's outermost islands, which the
        // legacy 1.3-zone-radius spacing left only a few tiles away.
        const zoneClearance = ARCHIPELAGO_ZONE_RADIUS + ISLAND_MAX_RADIUS + outerRadius + 10;
        const clearOfZones = zones.every((z) => distTo(candX, candY, z.cx, z.cy) >= zoneClearance);
        if (clearOfZones && farFromOtherAtolls && isOpenOceanSite(candX, candY, outerRadius + ATOLL_OPEN_WATER_MARGIN, true)) {
          placed = true;
          break;
        }
        continue;
      }
      const farFromContinents = distToNearestContinentalPlate(candX, candY) >= MIN_DIST_FROM_CONTINENT;
      placed = true;
      if ((farFromContinents && farFromZones && farFromOtherAtolls) || attempt === ATOLL_PLACEMENT_ATTEMPTS - 1) break;
    }
    if (!placed) continue;
    if (!openOceanOnly) {
      atolls.push({ cx, cy, outerRadius });
      continue;
    }
    atolls.push({ cx, cy, outerRadius, shape: naturalAtollShape(i * 10, seed) });
    placeCompanions(atolls, i, cx, cy, outerRadius, seed);
  }
  cachedAtolls = atolls;
  return cachedAtolls;
};

// Read-only listing of this world's atolls (centres and radii), for tests
// and tools that need to measure each one separately.
export const atollSites = (): ReadonlyArray<{ cx: number; cy: number; outerRadius: number }> => buildAtolls();

// Additive elevation contribution shaped like a ring: strongly positive in
// an annulus near outerRadius (the reef/land ring), strongly negative inside
// it (the lagoon), and zero beyond it (open ocean).
export const atollBumpAt = (wx: number, wy: number): number => {
  let bump = 0;
  for (const atoll of buildAtolls()) {
    if (atoll.shape) {
      // v10+: natural shape -- see worldgen-atoll-shape.ts.
      const dx = ((wx - atoll.cx + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2;
      bump += naturalAtollBump(dx, wy - atoll.cy, atoll.outerRadius, atoll.shape, ATOLL_RING_BUMP_HEIGHT_V10, ATOLL_LAGOON_DEPRESSION);
      continue;
    }
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
      bump += (continentSeparationActive() ? ATOLL_RING_BUMP_HEIGHT_V10 : ATOLL_RING_BUMP_HEIGHT) * t;
    }
  }
  return bump;
};
