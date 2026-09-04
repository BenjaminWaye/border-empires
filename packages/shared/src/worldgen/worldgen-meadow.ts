// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// A recognizable landmark formation on top of v3's fine-grained mottle
// texture: a circular clearing of LIGHT grass ("meadow") with a ring of
// DARK grass ("forest") around it, scattered across grassland the same way
// isHighlandsClusterAt (worldgen-hills.ts) scatters discrete hill
// formations. Unlike the mottle noise, this is intentionally coherent at a
// larger scale (radius ~4-8 tiles, ring ~3-6 tiles wide) so it reads as a
// distinct place -- "a meadow in the woods" -- rather than more texture.
//
// Gated behind worldgenVersion 4 so already-running seasons (v1-v3) don't
// suddenly grow meadows mid-game.
import type { RegionType } from "../types.js";
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { seeded01 } from "./worldgen-noise.js";
import { forestDarkThresholdFor, forestFieldAt } from "./worldgen-biome-thresholds.js";

const MEADOW_CELL = 90;
const MEADOW_CHANCE = 0.35; // fraction of cells that roll a meadow formation

// A meadow's center can sit near a cell boundary and its ring can spill
// into a neighboring cell, so every candidate center within one cell of
// (x, y) is checked, not just (x, y)'s own cell.
export const meadowRingAt = (x: number, y: number, seed: number): "CLEARING" | "RING" | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const gx0 = Math.floor(wx / MEADOW_CELL);
  const gy0 = Math.floor(wy / MEADOW_CELL);
  for (let dgy = -1; dgy <= 1; dgy++) {
    for (let dgx = -1; dgx <= 1; dgx++) {
      const gx = gx0 + dgx;
      const gy = gy0 + dgy;
      if (seeded01(gx, gy, seed + 951) > MEADOW_CHANCE) continue;
      const cx = gx * MEADOW_CELL + Math.floor(seeded01(gx, gy, seed + 952) * MEADOW_CELL);
      const cy = gy * MEADOW_CELL + Math.floor(seeded01(gx, gy, seed + 953) * MEADOW_CELL);
      const radius = 4 + Math.floor(seeded01(gx, gy, seed + 954) * 5); // 4..8
      const ringWidth = 3 + Math.floor(seeded01(gx, gy, seed + 955) * 4); // 3..6
      const dx = Math.min(Math.abs(wx - cx), WORLD_WIDTH - Math.abs(wx - cx));
      const dy = Math.min(Math.abs(wy - cy), WORLD_HEIGHT - Math.abs(wy - cy));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) return "CLEARING";
      if (dist <= radius + ringWidth) return "RING";
    }
  }
  return undefined;
};

// Full grassShadeAt decision for a GRASS/TUNDRA tile: meadow override (v4+,
// GRASS only) first, falling back to the regular forestField/darkThreshold
// mottle logic otherwise. Kept here (not worldgen.ts, already at the repo's
// 500-line cap) so callers need one call instead of inlining both checks.
export const grassShadeFor = (
  wx: number,
  wy: number,
  seed: number,
  version: number,
  region: RegionType | undefined,
  biome: "GRASS" | "TUNDRA"
): "LIGHT" | "DARK" => {
  const meadow = biome === "GRASS" && version >= 4 ? meadowRingAt(wx, wy, seed) : undefined;
  if (meadow === "CLEARING") return "LIGHT";
  if (meadow === "RING") return "DARK";
  const forestField = forestFieldAt(wx, wy, seed, version);
  return forestField < forestDarkThresholdFor(region, version) ? "DARK" : "LIGHT";
};
