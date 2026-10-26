import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";
import { isForestTileAt } from "../forest-terrain/forest-terrain.js";
import { grassShadeAt, landBiomeAt, wasForestBeforeClearingAt, worldSeed } from "./worldgen.js";
import { seeded01 } from "./worldgen-noise.js";

/** The original scattered broadleaf pattern, now an authoritative resin site. */
export const isResinTreeSiteAt = (x: number, y: number): boolean => {
  if (isForestTileAt(x, y) || isHillsTileAt(x, y) || wasForestBeforeClearingAt(x, y)) return false;
  if (landBiomeAt(x, y) !== "GRASS" || grassShadeAt(x, y) !== "LIGHT") return false;
  return seeded01(x * 131 + 7, y * 197 + 13, worldSeed() + 90210) < 0.3;
};
