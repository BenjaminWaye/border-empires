import { MUSTER_ATTACK_COST, musterFlagCap } from "@border-empires/shared";
import { predictedMusterAmount, type MusterRateCache } from "./client-muster-prediction/client-muster-prediction.js";
import { musterFlagDesignFor } from "./client-cosmetics/client-cosmetics.js";
import type { MusterOverlay } from "./client-map-3d-muster-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
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

// The flag progress badge's per-flag lookup, re-exported beside the banner's
// own fill ratio so client-map-3d.ts wires both from one import.
export { musterBadgeLookup } from "./client-muster-flag-badge/client-muster-flag-badge.js";

/**
 * Adds one tile's muster flag to the 3D overlay: fill, owner colour, ADVANCE
 * and the owner's flag cosmetic. Every viewer with vision of the tile gets the
 * same flag; the siege ring is the only part reserved for the flag's owner.
 * Lifted out of client-map-3d.ts's tile loop.
 */
export const addMusterFlagForTile = (
  overlay: Pick<MusterOverlay, "addMuster">,
  tile: Pick<Tile, "ownerId" | "muster">,
  place: { sceneX: number; sceneZ: number; surfaceY: number; wx: number; wy: number; tileKey: string; siegeResolvesAt: number },
  deps: {
    state: Pick<ClientState, "me" | "manpowerCap" | "manpower" | "musterAmountRateByTile" | "playerCosmetics">;
    effectiveOverlayColor: (ownerId: string) => string;
  }
): void => {
  const muster = tile.muster;
  if (!muster) return;
  const { state } = deps;
  const fillRatio = musterFillRatioForTile(tile, place.tileKey, state.me, state.manpowerCap, state.manpower, state.musterAmountRateByTile);
  overlay.addMuster(
    place.sceneX, place.sceneZ, place.surfaceY, fillRatio, deps.effectiveOverlayColor(muster.ownerId), muster.mode === "ADVANCE",
    place.wx, place.wy, muster.ownerId === state.me ? place.siegeResolvesAt : 0, musterFlagDesignFor(state, muster.ownerId)
  );
};
