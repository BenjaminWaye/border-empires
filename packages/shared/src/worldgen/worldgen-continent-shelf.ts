// v10+ plate-boundary shaping for continents style, split out of
// worldgen-continent-score.ts (500-line cap): rift seaways between separate
// continents, the continental shelf that replaces the elevation cliff at
// every plate edge, coastal collision belts, and fine coast detail. The
// caller (computePlateContinentScore) gates all of it on
// continentSeparationActive().
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { valueNoise } from "./worldgen-noise.js";
import {
  BOUNDARY_BLEND_WIDTH,
  boundaryStrengthOf,
  CONTINENTAL_MARGIN_UPLIFT,
  convergentStressOf,
  pairDiffGradientAt,
  UPLIFT_SCALE,
  upliftMultiplierFor,
} from "./worldgen-plate-boundary.js";
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
// A strait of uniform width and depth between two straight-ish walls reads
// as a canal. Real straits pinch into narrows and open into seas (Gibraltar,
// the Bosporus, the Red Sea), so the rift's width varies along its length
// and its centre line meanders. Both are measured in TILES: the plate
// distance difference the rest of this file works in can change by anything
// from ~2 to 10+ units per tile (the per-plate distance distortion), so a
// width or meander given in those units collapsed to a thin, straight
// channel wherever the difference changes fast.
const RIFT_HALF_WIDTH_TILES = 18;
const RIFT_DEPTH = 1.0;
const RIFT_WIDTH_CELL = 80;
const RIFT_WIDTH_MIN = 0.75;
const RIFT_WIDTH_SPAN = 0.6;
const RIFT_WANDER_CELL = 50;
const RIFT_WANDER_TILES = 9;

// v10+: realistic coasts. A plate's elevation used to be a flat plateau
// (continental 0.55-0.8, oceanic 0.1-0.3) with a CLIFF at the Voronoi edge, so
// most coastlines sat on that cliff -- where shorelineRoughnessAt's +/-10%
// multiplier can move the shoreline by a fraction of a tile -- and traced the
// straight plate boundary. Real continents end in a sloping shelf, which is
// what lets coastline detail show at every scale. Elevation now blends
// between the two plates across SHELF_WIDTH, and the boundary the shelf (and
// any rift seaway) is centred on wanders, so neither follows a straight line.
const SHELF_WIDTH = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.12;
const BOUNDARY_WANDER_CELL = 70;
const BOUNDARY_WANDER = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.08;
const BOUNDARY_WANDER_FINE_CELL = 22;
const BOUNDARY_WANDER_FINE = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.03;
const boundaryWanderAt = (wx: number, wy: number): number =>
  (valueNoise(wx, wy, BOUNDARY_WANDER_CELL, worldSeed() + 4401) - 0.5) * 2 * BOUNDARY_WANDER +
  (valueNoise(wx, wy, BOUNDARY_WANDER_FINE_CELL, worldSeed() + 4402) - 0.5) * 2 * BOUNDARY_WANDER_FINE;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// v10+ plate elevation (before feature bumps, roughness and coast detail)
// and the raw collision stress mountain ranges follow. Each boundary term
// pairs a plate with the specific neighbour that term is about, NOT with
// whichever plate happens to be second-nearest: the second-nearest plate
// switches along straight lines (edges of the second-order Voronoi diagram),
// so any term keyed on it -- shelf blend, rift depth -- jumped there, leaving
// ruler-straight coasts and strait walls. Concretely, for a continental tile:
//   - shelf + coastal-range belt: against the nearest OCEANIC plate;
//   - rift seaway: against the nearest continent of a DIFFERENT cluster;
//   - internal blend + collision: against the second-nearest plate only when
//     it belongs to the same continent.
// Every pairwise offset is signed by a fixed plate ordering, so both sides of
// a boundary compute the same value there.
export const v10PlateElevation = (
  wx: number, wy: number, plates: Plate[], dists: Float64Array, nearIdx: number, farIdx: number
): { elevation: number; stress: number } => {
  const near = plates[nearIdx]!;
  const far = plates[farIdx]!;
  const nearDist = dists[nearIdx]!;
  const farDist = dists[farIdx]!;
  const wander = boundaryWanderAt(wx, wy);
  // Positive inside plate a's territory, boundary centre line wandered.
  const pairOffset = (a: number, b: number): number => dists[b]! - dists[a]! + (a < b ? wander : -wander);
  const evenBlend = (a: number, b: number): number => {
    const w = clamp01((pairOffset(a, b) + SHELF_WIDTH) / (2 * SHELF_WIDTH));
    return plates[a]!.baseElevation * w + plates[b]!.baseElevation * (1 - w);
  };

  if (!near.isContinental) {
    // The ocean keeps its own depth right up to a continent (the shelf is
    // part of the continent); only ocean-ocean boundaries blend and sag.
    if (far.isContinental) return { elevation: near.baseElevation, stress: 0 };
    const s = convergentStressOf(near, far);
    const sag = boundaryStrengthOf(nearDist, farDist) * s * upliftMultiplierFor(false, false, s) * UPLIFT_SCALE;
    return { elevation: evenBlend(nearIdx, farIdx) + sag, stress: 0 };
  }

  const sameContinentFar = far.isContinental && far.clusterId === near.clusterId;
  let elevation = sameContinentFar ? evenBlend(nearIdx, farIdx) : near.baseElevation;
  let stress = 0;
  if (sameContinentFar) {
    const s = convergentStressOf(near, far);
    const strength = boundaryStrengthOf(nearDist, farDist);
    elevation += strength * s * upliftMultiplierFor(true, true, s) * UPLIFT_SCALE;
    if (s > 0) stress = strength * s;
  }

  let oceanIdx = -1;
  let rivalIdx = -1;
  for (let i = 0; i < plates.length; i += 1) {
    const p = plates[i]!;
    if (!p.isContinental) {
      if (oceanIdx < 0 || dists[i]! < dists[oceanIdx]!) oceanIdx = i;
    } else if (p.clusterId !== near.clusterId && (rivalIdx < 0 || dists[i]! < dists[rivalIdx]!)) {
      rivalIdx = i;
    }
  }

  if (oceanIdx >= 0) {
    const ocean = plates[oceanIdx]!;
    const intoContinent = dists[oceanIdx]! - nearDist;
    // Wander varies the shelf's width rather than shifting it, so the slope
    // still starts exactly at the plate boundary (no step at the coast).
    const shelf = SHELF_WIDTH * (1 + 0.5 * (wander / (BOUNDARY_WANDER + BOUNDARY_WANDER_FINE)));
    const w = clamp01(intoContinent / shelf);
    elevation = ocean.baseElevation + (elevation - ocean.baseElevation) * w;
    // Collision belt at the shelf top: Andes-style coastal ranges just inland.
    const belt = Math.max(0, 1 - Math.abs(intoContinent - shelf) / (BOUNDARY_BLEND_WIDTH * 2));
    if (belt > 0) {
      const s = convergentStressOf(near, ocean);
      elevation += belt * s * (s >= 0 ? CONTINENTAL_MARGIN_UPLIFT : -0.15) * UPLIFT_SCALE;
      if (s > 0) stress = Math.max(stress, belt * s);
    }
  }

  if (rivalIdx >= 0) {
    const rival = plates[rivalIdx]!;
    const offset = pairOffset(nearIdx, rivalIdx);
    // Cheap reject before the gradient: past ~6 units/tile no rift reaches here.
    if (offset < (RIFT_HALF_WIDTH_TILES * (RIFT_WIDTH_MIN + RIFT_WIDTH_SPAN) + RIFT_WANDER_TILES) * 6) {
      const seed = worldSeed();
      const riftWander = (valueNoise(wx, wy, RIFT_WANDER_CELL, seed + 4501) - 0.5) * 2 * RIFT_WANDER_TILES;
      const offsetTiles = offset / Math.max(0.5, pairDiffGradientAt(wx, wy, near, rival));
      const riftOffset = offsetTiles + (nearIdx < rivalIdx ? riftWander : -riftWander);
      const halfWidth =
        RIFT_HALF_WIDTH_TILES * (RIFT_WIDTH_MIN + valueNoise(wx, wy, RIFT_WIDTH_CELL, seed + 4502) * RIFT_WIDTH_SPAN);
      elevation -= Math.max(0, 1 - Math.abs(riftOffset) / halfWidth) * RIFT_DEPTH;
    }
  }
  return { elevation, stress };
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

// v10+: fine displacement of where plate elevation is sampled. Additive coast
// detail moves a shoreline by (noise / local slope), so on a steep wall -- a
// rift strait or a coastal-range belt -- it moved the coast by under a tile
// and those coasts stayed ruler-straight. Displacing the sample point moves
// every coast by the same few tiles however steep it is, giving the 2-20 tile
// wiggle real coasts have. Raw-tile sampled so the big domain warp can't
// stretch it.
const COAST_DISPLACE_CELL = 18;
const COAST_DISPLACE_TILES = 6;
const COAST_DISPLACE_FINE_CELL = 6;
const COAST_DISPLACE_FINE_TILES = 2.5;
export const coastDisplacementAt = (x: number, y: number): { dx: number; dy: number } => {
  const seed = worldSeed();
  const n = (cell: number, offset: number): number => (valueNoise(x, y, cell, seed + offset) - 0.5) * 2;
  return {
    dx: n(COAST_DISPLACE_CELL, 7701) * COAST_DISPLACE_TILES + n(COAST_DISPLACE_FINE_CELL, 7703) * COAST_DISPLACE_FINE_TILES,
    dy: n(COAST_DISPLACE_CELL, 7702) * COAST_DISPLACE_TILES + n(COAST_DISPLACE_FINE_CELL, 7704) * COAST_DISPLACE_FINE_TILES,
  };
};
