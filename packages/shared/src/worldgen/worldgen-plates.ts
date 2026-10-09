// Tectonic-plate generation (continents style only -- islands style keeps its
// own hand-built buildIslands() ellipse seeding in worldgen-continents.ts,
// which is lower-risk to leave alone per the realistic-maps plan). Modeled on
// the Voronoi-plates-with-drift approach from Red Blob Games' polygonal map
// generation / 1843 planet generation and LeatherBee's "Terrain Generation 4"
// series: each plate is a Voronoi cell with a drift vector, and continent
// shape + mountain ranges both fall out of how neighboring plates' drift
// vectors interact at their shared boundary (worldgen-continent-score.ts).
// This file only builds the plates themselves -- no dependency on terrain
// state, matching the split rationale already used for
// worldgen-continents.ts / worldgen-mountain-rings.ts.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { POLAR_BAND, TAU, seeded01, worldSeed } from "./worldgen.js";
import { continentSeparationActive } from "./worldgen-version.js";

export type Plate = {
  cx: number;
  cy: number;
  isContinental: boolean;
  /**
   * Index of the continent cluster this plate belongs to (-1 for oceanic
   * plates). Continental plates in different clusters are separate
   * continents: worldgen-continent-score.ts rifts a seaway between them
   * instead of letting their Voronoi cells fuse into one landmass.
   */
  clusterId: number;
  driftAngle: number;
  driftSpeed: number;
  baseElevation: number;
};

// Cut from 24: full-map generation time scales directly with plate count
// (every tile checks distance -- now per-plate-distorted, see
// distortedDistanceTo in worldgen-continent-score.ts -- to every plate), and
// 24 plates pushed real full-map generation past 30s in some environments,
// timing out apps/simulation's startup integration tests. Cluster-based
// continent placement (below) guarantees separate continents regardless of
// this count; it only trades off how many internal boundaries (mountain
// ranges, coastline detail) each continent gets.
const PLATE_COUNT = 16;
// Rejection-sampled minimum spacing between plate centers so they don't
// cluster into one giant blob or leave huge empty gaps -- simple Poisson-disk
// style rejection is plenty at this plate count (no need for a real
// Poisson-disk grid algorithm).
const MIN_PLATE_SPACING = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.13;
const PLACEMENT_ATTEMPTS_PER_PLATE = 60;

// Assigning isContinental independently per plate (a coin flip) is a
// percolation problem: at any chance high enough to leave room for ~29%
// land, the continental plates are well above the threshold where a random
// proximity graph almost always has one giant connected component -- so
// independent per-plate coin flips reliably produced one supercontinent
// covering 80-95% of all land, no matter how that one chance constant was
// tuned. Real "5 separate continents" results from these generators (see
// gamedev.net/forums/topic/623145) come from continents being distinct
// REGIONS, not an emergent side effect of independent per-plate typing.
// This picks CONTINENT_CLUSTER_COUNT well-separated centers first and marks
// only plates near one of those centers as continental -- the plate
// boundaries *within* one cluster still do all the real work (coastline
// shape, mountain ranges from convergent boundaries), this only decides
// which of several separate regions gets to be a continent at all.
// Scaled by total map area (relative to the original 450x450 square) rather
// than left fixed at 5 -- after the widescreen (640x320) aspect change, the
// cluster radius itself is still tied to min(WORLD_WIDTH, WORLD_HEIGHT), so a
// fixed cluster COUNT left proportionally less of the now much wider map
// within reach of any cluster, causing some seeds to calibrate well under
// the ~29% land target (an unlucky cluster layout leaving large stretches of
// the map with no continental plates at all). More, still well-separated
// clusters keeps coverage (and therefore realized land fraction) consistent
// seed-to-seed instead of leaving it to chance how far clusters happen to
// spread across the extra width.
// Nudged from 5x to 5.5x the aspect ratio (10 -> 11 clusters at the current
// 2:1 widescreen size) -- visual review of generated worlds showed large,
// consistently-empty ocean stretches (e.g. one whole quadrant with no land at
// all) even though average land fraction was in range, meaning clusters were
// spread too thin to reliably fill the wider map. One more cluster tightens
// coverage without pushing land fraction toward a single sprawling
// supercontinent.
const CONTINENT_CLUSTER_COUNT = Math.round(5.5 * (WORLD_WIDTH / WORLD_HEIGHT));
const CONTINENT_CLUSTER_RADIUS = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.14;
const CLUSTER_MIN_SPACING = CONTINENT_CLUSTER_RADIUS * 2.4;
const CLUSTER_PLACEMENT_ATTEMPTS = 60;

const toroidalDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};

let cachedPlatesSeed = Number.NaN;
let cachedPlatesSeparation = false;
let cachedPlates: Plate[] = [];

type ClusterCenter = { cx: number; cy: number };

const buildContinentClusters = (seed: number): ClusterCenter[] => {
  const clusters: ClusterCenter[] = [];
  for (let i = 0; i < CONTINENT_CLUSTER_COUNT; i += 1) {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < CLUSTER_PLACEMENT_ATTEMPTS; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 210011) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 220022) * WORLD_HEIGHT);
      const farEnough = clusters.every(
        (c) => Math.hypot(toroidalDx(candX, c.cx), candY - c.cy) >= CLUSTER_MIN_SPACING
      );
      cx = candX;
      cy = candY;
      if (farEnough || attempt === CLUSTER_PLACEMENT_ATTEMPTS - 1) break;
    }
    clusters.push({ cx, cy });
  }
  return clusters;
};

const nearestCluster = (cx: number, cy: number, clusters: ClusterCenter[]): { index: number; dist: number } => {
  let index = -1;
  let dist = Infinity;
  clusters.forEach((c, i) => {
    const d = Math.hypot(toroidalDx(cx, c.cx), cy - c.cy);
    if (d < dist) {
      dist = d;
      index = i;
    }
  });
  return { index, dist };
};

// v10+: how much of the (non-polar) map continental plates must cover. The
// radius-only rule above typically marked ~6 of 16 plates (~37% of the map)
// continental, but land is calibrated to TARGET_LAND_FRACTION (45%) in
// worldgen-continent-score.ts -- so the sea threshold had to drop until the
// highest OCEANIC plates surfaced as land, and those land bridges fused
// otherwise-separate continents into one supercontinent. Covering the land
// target plus a margin (coasts, rift seaways) keeps oceanic plates as ocean.
const CONTINENTAL_AREA_TARGET = 0.65;
const AREA_SAMPLE_STEP = 8;

// Share of the non-polar map whose nearest (undistorted) plate centre is
// each plate -- a cheap estimate of each Voronoi cell's area.
const plateAreaShares = (centers: Array<{ cx: number; cy: number }>): number[] => {
  const counts = centers.map(() => 0);
  let total = 0;
  for (let y = POLAR_BAND; y < WORLD_HEIGHT - POLAR_BAND; y += AREA_SAMPLE_STEP) {
    for (let x = 0; x < WORLD_WIDTH; x += AREA_SAMPLE_STEP) {
      let best = 0;
      let bestDist = Infinity;
      centers.forEach((c, i) => {
        const d = Math.hypot(toroidalDx(x, c.cx), y - c.cy);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      counts[best] = (counts[best] ?? 0) + 1;
      total += 1;
    }
  }
  return counts.map((n) => n / Math.max(1, total));
};

// Returns each plate's cluster id, or -1 for oceanic plates.
const assignContinents = (centers: Array<{ cx: number; cy: number }>, clusters: ClusterCenter[]): number[] => {
  const nearest = centers.map((c) => nearestCluster(c.cx, c.cy, clusters));
  if (!continentSeparationActive()) {
    // Legacy: continental only within a cluster's radius (see note above buildPlates).
    return nearest.map((n) => (n.dist < CONTINENT_CLUSTER_RADIUS ? n.index : -1));
  }
  const shares = plateAreaShares(centers);
  const order = centers.map((_, i) => i).sort((a, b) => nearest[a]!.dist - nearest[b]!.dist);
  const ids = centers.map(() => -1);
  let covered = 0;
  for (const i of order) {
    if (covered >= CONTINENTAL_AREA_TARGET && nearest[i]!.dist >= CONTINENT_CLUSTER_RADIUS) break;
    // Plates inside a cluster's radius fuse into that cluster's continent;
    // plates only added to reach the area target are continents of their own.
    ids[i] = nearest[i]!.dist < CONTINENT_CLUSTER_RADIUS ? nearest[i]!.index : clusters.length + i;
    covered += shares[i]!;
  }
  return ids;
};

export const buildPlates = (): Plate[] => {
  const seed = worldSeed();
  const separation = continentSeparationActive();
  if (seed === cachedPlatesSeed && separation === cachedPlatesSeparation && cachedPlates.length > 0) return cachedPlates;
  cachedPlatesSeed = seed;
  cachedPlatesSeparation = separation;

  const clusters = buildContinentClusters(seed);
  const centers: Array<{ cx: number; cy: number }> = [];
  for (let i = 0; i < PLATE_COUNT; i += 1) {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS_PER_PLATE; attempt += 1) {
      const candX = Math.floor(seeded01(i, attempt, seed + 130001) * WORLD_WIDTH);
      const candY = Math.floor(seeded01(i, attempt, seed + 140002) * WORLD_HEIGHT);
      const farEnough = centers.every(
        (p) => Math.hypot(toroidalDx(candX, p.cx), candY - p.cy) >= MIN_PLATE_SPACING
      );
      cx = candX;
      cy = candY;
      if (farEnough || attempt === PLACEMENT_ATTEMPTS_PER_PLATE - 1) break;
    }
    centers.push({ cx, cy });
  }
  const clusterIds = assignContinents(centers, clusters);
  cachedPlates = centers.map(({ cx, cy }, i) => {
    const isContinental = clusterIds[i]! >= 0;
    return {
      cx,
      cy,
      isContinental,
      clusterId: clusterIds[i]!,
      driftAngle: seeded01(i, 1, seed + 160004) * TAU,
      driftSpeed: 0.5 + seeded01(i, 2, seed + 170005) * 0.5,
      baseElevation: isContinental
        ? 0.55 + seeded01(i, 3, seed + 180006) * 0.25
        : 0.1 + seeded01(i, 4, seed + 190007) * 0.2,
    };
  });
  return cachedPlates;
};
