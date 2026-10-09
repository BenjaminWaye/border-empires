// v10+ plate-boundary shaping for continents style, split out of
// worldgen-continent-score.ts (500-line cap): rift seaways between separate
// continents, and the continental shelf that replaces the elevation cliff at
// every plate edge. Pure functions of the plate pair and position -- the
// caller (computePlateContinentScore) gates them on continentSeparationActive().
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { valueNoise } from "./worldgen-noise.js";
import type { Plate } from "./worldgen-plates.js";
import { worldSeed } from "./worldgen.js";

// v10+: continental plates from DIFFERENT continent clusters (see
// worldgen-plates.ts) used to meet like any other pair -- usually as a
// continental collision -- so neighbouring clusters' Voronoi cells fused
// into one landmass holding 80-100% of all land on many seeds. Real
// separate continents have ocean between them, so that boundary becomes a
// rift seaway instead: a depression deep enough to sit well below any
// calibrated sea threshold, spread over a wider band than the mountain-
// building blend so the strait reads as open water, not a crack.
const RIFT_BLEND_WIDTH = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.1;
const RIFT_DEPTH = 1.1;
export const isSeparateContinentPair = (near: Plate, far: Plate): boolean =>
  near.isContinental && far.isContinental && near.clusterId !== far.clusterId;

// v10+: realistic coasts. A plate's elevation used to be a flat plateau
// (continental 0.55-0.8, oceanic 0.1-0.3) with a CLIFF at the Voronoi edge, so
// most coastlines sat on that cliff -- where shorelineRoughnessAt's +/-10%
// multiplier can move the shoreline by a fraction of a tile -- and traced the
// straight plate boundary. Real continents end in a sloping shelf, which is
// what lets coastline detail show at every scale. Elevation now blends
// between the two plates across SHELF_WIDTH, and the boundary the shelf (and
// any rift seaway) is centred on wanders, so neither follows a straight line.
export const SHELF_WIDTH = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.12;
const BOUNDARY_WANDER_CELL = 70;
const BOUNDARY_WANDER = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.08;
const BOUNDARY_WANDER_FINE_CELL = 22;
const BOUNDARY_WANDER_FINE = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.03;
const boundaryWanderAt = (wx: number, wy: number): number =>
  (valueNoise(wx, wy, BOUNDARY_WANDER_CELL, worldSeed() + 4401) - 0.5) * 2 * BOUNDARY_WANDER +
  (valueNoise(wx, wy, BOUNDARY_WANDER_FINE_CELL, worldSeed() + 4402) - 0.5) * 2 * BOUNDARY_WANDER_FINE;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Shelf base elevation and rift depth for (wx, wy). The offset is signed
// relative to a fixed plate ordering, not "near minus far", so both sides of
// a boundary compute the same value there -- otherwise the blend would just
// move the cliff instead of removing it.
export const shelvedBaseAndRift = (
  wx: number, wy: number, near: Plate, nearDist: number, far: Plate, farDist: number, nearFirst: boolean
): { base: number; riftDepth: number; nearWeight: number; offset: number } => {
  const wander = boundaryWanderAt(wx, wy);
  // Positive inside `near`'s territory, after wandering the centre line.
  const offset = farDist - nearDist + (nearFirst ? wander : -wander);
  // A continental shelf is part of the continent: between a continental and
  // an oceanic plate the whole slope sits on the continental side, so the
  // ocean keeps its full depth right up to the boundary. A symmetric blend
  // raised every ocean margin near a continent, and two such margins plus
  // coast detail bridged neighbouring continents back together. Same-type
  // pairs (and separate continents, which the rift handles) blend evenly.
  let nearWeight: number;
  if (near.isContinental && !far.isContinental) nearWeight = clamp01(offset / SHELF_WIDTH);
  else if (!near.isContinental && far.isContinental) nearWeight = 1 - clamp01(-offset / SHELF_WIDTH);
  else nearWeight = clamp01((offset + SHELF_WIDTH) / (2 * SHELF_WIDTH));
  const base = near.baseElevation * nearWeight + far.baseElevation * (1 - nearWeight);
  const riftDepth = isSeparateContinentPair(near, far)
    ? Math.max(0, 1 - Math.abs(offset) / RIFT_BLEND_WIDTH) * RIFT_DEPTH
    : 0;
  return { base, riftDepth, nearWeight, offset };
};

// v10+: fine coastline detail. shorelineRoughnessAt multiplies the score by
// a calibrated +/-10% or so, which on a coastal slope moves the shoreline by
// only a tile or two and never produces the coves, capes and rocky notches
// real coasts have at every scale. This adds an fBm term (3-24 tile cells,
// gain ~0.6) directly to the score, sampled at the RAW tile so the domain
// warp can't stretch it into streaks. Its strength varies by region and rises
// toward high latitudes -- craggy, fjord-like coasts in the cold (Norway,
// Chile, British Columbia), calmer ones elsewhere, as on Earth.
const COAST_DETAIL_OCTAVES = [
  { cell: 24, weight: 0.45 },
  { cell: 12, weight: 0.28 },
  { cell: 6, weight: 0.17 },
  { cell: 3, weight: 0.1 },
] as const;
const COAST_DETAIL_AMPLITUDE = 0.45;
const COAST_DETAIL_REGION_CELL = 120;
export const coastDetailAt = (x: number, y: number): number => {
  const seed = worldSeed();
  let sum = 0;
  COAST_DETAIL_OCTAVES.forEach(({ cell, weight }, i) => {
    sum += (valueNoise(x, y, cell, seed + 6601 + i * 13) - 0.5) * 2 * weight;
  });
  const latitude = Math.abs(y - WORLD_HEIGHT / 2) / (WORLD_HEIGHT / 2);
  const regional = valueNoise(x, y, COAST_DETAIL_REGION_CELL, seed + 6701);
  const strength = 0.45 + 0.7 * latitude * latitude + 0.6 * regional;
  return sum * COAST_DETAIL_AMPLITUDE * strength;
};
