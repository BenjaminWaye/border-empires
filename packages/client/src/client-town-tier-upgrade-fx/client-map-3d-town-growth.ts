import type { TownOverlay, TownTier } from "../client-map-3d-town-overlay.js";
import { townClockSecondsAt, TOWN_GROW_RISE, TOWN_GROW_SINK } from "../client-map-3d-town-overlay/town-growth-shader.js";
import { isTownGrowthActive, type TownTierUpgradeFxEntry } from "./client-town-tier-upgrade-fx.js";

/**
 * Adds a live town to the 3D town overlay. While the town is mid tier-upgrade
 * it is drawn twice -- the old tier sinking, the new tier growing -- with the
 * transition timed in the town shaders (town-growth-shader.ts) from the
 * upgrade's start, so a rebuild part-way through picks the transition up
 * where it is rather than restarting it.
 */
export const addTownInstanceWithGrowth = (
  overlay: Pick<TownOverlay, "addInstance">,
  upgrade: TownTierUpgradeFxEntry | undefined,
  x: number,
  z: number,
  surfaceY: number,
  tier: TownTier,
  tileX: number,
  tileY: number,
  nowEpochMs = Date.now(),
  nowPerformanceMs = performance.now()
): void => {
  if (!isTownGrowthActive(upgrade, nowEpochMs) || upgrade.tier !== tier) {
    overlay.addInstance(x, z, surfaceY, tier, tileX, tileY);
    return;
  }
  const startSeconds = townClockSecondsAt(nowPerformanceMs - (nowEpochMs - upgrade.startedAt));
  overlay.addInstance(x, z, surfaceY, upgrade.fromTier, tileX, tileY, false, { mode: TOWN_GROW_SINK, startSeconds });
  overlay.addInstance(x, z, surfaceY, tier, tileX, tileY, false, { mode: TOWN_GROW_RISE, startSeconds });
};
