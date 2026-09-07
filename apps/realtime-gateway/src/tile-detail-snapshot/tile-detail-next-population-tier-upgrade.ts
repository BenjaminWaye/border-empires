// Town-upgrade-ready badge helper split out of tile-detail-snapshot.ts to
// keep that file under the repo's 500-line cap.
import { nextTownGrowthUpgrade, type PopulationTier, type TownGrowthUpgradeView } from "@border-empires/shared";

/**
 * Recomputed fresh from the snapshot rather than trusted from the tile's
 * persisted townJson — toSharedVisibilityTownSummary's allowlist
 * (live-snapshot-view.ts) strips nextPopulationTierUpgrade before
 * persisting, so this gateway-served tile-detail path never surfaced the
 * town-upgrade-ready map badge (client-town-growth.ts) at all for any
 * viewer, including the town's own owner, before this function existed.
 */
export const nextPopulationTierUpgradeForSnapshotTown = (
  populationTier: PopulationTier,
  population: number | undefined
): TownGrowthUpgradeView | undefined =>
  typeof population === "number" ? nextTownGrowthUpgrade(populationTier, population) : undefined;
