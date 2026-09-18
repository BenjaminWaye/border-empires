// A small water pool with a fertile ring around it, scattered inside large
// arid (CRYSTAL_WASTES) regions -- the "oasis in the desert" landmark. Two
// mechanical effects, both real (not just visual, unlike the v8 biome
// promotions in worldgen-visual-biome.ts): the water tile is forced to SEA
// terrain (wired into baseTerrainCodeAt, same insertion point as isLake),
// and the ring around it is forced to GRASS instead of SAND (wired into
// landBiomeAt's SAND branch) so it functions as real, farmable ground.
//
// isCrystalWastesRegion below duplicates regionTypeAt's own noise formula
// rather than calling regionTypeAt directly: regionTypeAt requires terrain
// to already be resolved to LAND (it early-returns otherwise), but this
// runs from inside baseTerrainCodeAt -- the function still deciding that
// tile's terrain in the first place. Calling regionTypeAt from here would
// recurse back into baseTerrainCodeAt for the same coordinate.
//
// Gated behind worldgenVersion 8 so already-running seasons don't suddenly
// grow oases mid-game.
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { seeded01, valueNoise } from "./worldgen-noise.js";
import { regionLatitudeBiasAt } from "./worldgen-latitude.js";
import { continentField, getInlandThresholds } from "./worldgen-continent-score.js";

const OASIS_CELL = 100;
const OASIS_CHANCE = 0.5; // fraction of eligible (CRYSTAL_WASTES-centered, on-land) cells that roll an oasis
// A single jittered point per cell landing on both CRYSTAL_WASTES noise and
// solid ground is individually rare (~1% per point at a realistic ~29% land
// fraction), which made most worlds get zero oases at all. Trying several
// independent candidate points per cell (each its own seed salt) before
// giving up keeps a cell's overall odds high without weakening the per-point
// requirements that make an oasis actually land on ground.
const CANDIDATES_PER_CELL = 24;

// Mirrors regionTypeAt's v1/v2-vs-v3+ noise (worldgen.ts) minus the terrain
// guard and caching -- only the CRYSTAL_WASTES cutoff (v >= 0.8) matters
// here, so this only needs to check that one threshold, not build the
// whole RegionType.
const isCrystalWastesRegion = (wx: number, wy: number, seed: number, version: number): boolean => {
  const cell = version < 2 ? [180, 120, 260] : [60, 38, 95];
  const a = valueNoise(wx, wy, cell[0]!, seed + 1403);
  const b = valueNoise(wx + 137, wy + 59, cell[1]!, seed + 1417);
  const c = valueNoise(wx - 83, wy + 191, cell[2]!, seed + 1429);
  const bias = version >= 7 ? regionLatitudeBiasAt(wy) : 0;
  const v = Math.min(1, Math.max(0, a * 0.52 + b * 0.28 + c * 0.2 + bias));
  return v >= 0.8;
};

export type OasisFeature = "WATER" | "RING";

type OasisCell = { cx: number; cy: number; radius: number; ringWidth: number } | null;

// Resolving a cell tries up to CANDIDATES_PER_CELL candidate points, each
// re-evaluating continentField/noise -- too expensive to redo on every tile
// query (oasisFeatureAt runs from baseTerrainCodeAt, i.e. potentially once
// per tile on the map, and checks a 3x3 block of cells each time). Cache
// each cell's resolved oasis (or the fact that it has none) per seed/version
// instead, so the search runs once per cell rather than once per tile query.
let cellCacheKey = "";
const cellCache = new Map<string, OasisCell>();

const resolveOasisCell = (gx: number, gy: number, seed: number, version: number): OasisCell => {
  const key = `${gx},${gy}`;
  const cached = cellCache.get(key);
  if (cached !== undefined) return cached;
  let resolved: OasisCell = null;
  for (let attempt = 0; attempt < CANDIDATES_PER_CELL; attempt += 1) {
    const salt = attempt * 97;
    const cx = gx * OASIS_CELL + Math.floor(seeded01(gx, gy, seed + 811 + salt) * OASIS_CELL);
    const cy = gy * OASIS_CELL + Math.floor(seeded01(gx, gy, seed + 812 + salt) * OASIS_CELL);
    if (!isCrystalWastesRegion(cx, cy, seed, version)) continue;
    // isCrystalWastesRegion is pure noise, unaware of land/sea -- with a
    // realistic (Earth-like) land fraction most of the map is ocean, so an
    // ungated candidate center usually sits far out at sea, and even a
    // radius-large-enough ring can never reach real land from there. Only
    // accept centers solidly on land so the oasis's ring has a real chance
    // of landing on ground instead of open ocean.
    if (continentField(cx, cy) < getInlandThresholds().continentIdentity) continue;
    if (seeded01(gx, gy, seed + 813 + salt) > OASIS_CHANCE) continue;
    // radius must be big enough to leave a true interior once carved --
    // terrainAt() promotes any SEA tile touching LAND back to LAND (the
    // "shoreline is capturable" rule), and every tile in a radius-2 pool
    // touches the fertile ring around it, so a radius that small would get
    // entirely swallowed back into land the moment it's queried.
    const radius = 3 + Math.floor(seeded01(gx, gy, seed + 814 + salt) * 3); // 3..5
    const ringWidth = 2 + Math.floor(seeded01(gx, gy, seed + 815 + salt) * 3); // 2..4
    resolved = { cx, cy, radius, ringWidth };
    break;
  }
  cellCache.set(key, resolved);
  return resolved;
};

export const oasisFeatureAt = (x: number, y: number, seed: number, version: number): OasisFeature | undefined => {
  if (version < 8) return undefined;
  const key = `${seed}:${version}`;
  if (key !== cellCacheKey) {
    cellCacheKey = key;
    cellCache.clear();
  }
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const gx0 = Math.floor(wx / OASIS_CELL);
  const gy0 = Math.floor(wy / OASIS_CELL);
  for (let dgy = -1; dgy <= 1; dgy++) {
    for (let dgx = -1; dgx <= 1; dgx++) {
      const cell = resolveOasisCell(gx0 + dgx, gy0 + dgy, seed, version);
      if (!cell) continue;
      const dx = Math.min(Math.abs(wx - cell.cx), WORLD_WIDTH - Math.abs(wx - cell.cx));
      const dy = Math.min(Math.abs(wy - cell.cy), WORLD_HEIGHT - Math.abs(wy - cell.cy));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= cell.radius) return "WATER";
      if (dist <= cell.radius + cell.ringWidth) return "RING";
    }
  }
  return undefined;
};
