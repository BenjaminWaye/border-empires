import { MUSTER_ATTACK_COST, musterFlagCap } from "@border-empires/shared";
import { predictedMusterAmount, type MusterRateCache } from "./client-muster-prediction/client-muster-prediction.js";
import type { Tile } from "./client-types.js";

/**
 * Fill ratio (0-1) for the 3D muster overlay bar on one tile. Interpolates
 * (predicts) our own flags between sparse server ticks via
 * predictedMusterAmount — see client-muster-prediction.ts — so the bar
 * animates continuously instead of stepping; rival flags fall straight
 * through unpredicted (predictedMusterAmount stops once ownerId !== me).
 * Extracted out of client-map-3d.ts, which is already over the 500-line
 * cap and must not grow.
 */
export const musterFillRatioForTile = (
  tile: Pick<Tile, "ownerId" | "muster">,
  tileKey: string,
  me: string,
  manpowerCap: number,
  manpower: number,
  musterAmountRateByTile: MusterRateCache
): number => {
  const cap = musterFlagCap(manpowerCap, tile.muster?.capLevel);
  const predictedAmount = predictedMusterAmount(musterAmountRateByTile, tileKey, tile, me, cap, manpower);
  return Math.min(1, predictedAmount / MUSTER_ATTACK_COST);
};
