// Per-player fortification strength ranking for the /api/activity endpoint.
// Sums, per tile owner, a fort-tier weight across every ACTIVE fort the
// player owns.
import { FORT_TIER_LADDER } from "@border-empires/shared";
import type { FortStatus, FortVariant } from "@border-empires/shared";
import type { FortificationRankingEntry } from "@border-empires/game-domain";

// FORT_TIER_LADDER's `defenseMult` (WOODEN_FORT 1.35, FORT 2.5,
// TITANIUM_BASTION 4, THUNDER_BASTION 8 -- structure-costs.ts) is already the
// authoritative in-game combat-strength multiplier for each fort tier, so we
// reuse it directly as the ranking weight instead of inventing a parallel
// number that could drift out of sync with balance changes.
const fortTierWeight = (variant: FortVariant): number => FORT_TIER_LADDER[variant].defenseMult;

export type FortificationRankingTile = {
  ownerId?: string | undefined;
  fort?: {
    ownerId: string;
    status: FortStatus;
    variant?: FortVariant | undefined;
  } | undefined;
};

export const computeFortificationRanking = (
  tiles: readonly FortificationRankingTile[]
): FortificationRankingEntry[] => {
  const byPlayer = new Map<string, { score: number; forts: number }>();
  for (const tile of tiles) {
    const fort = tile.fort;
    if (!fort || fort.status !== "active") continue;
    const variant = fort.variant ?? "FORT";
    const weight = fortTierWeight(variant);
    let entry = byPlayer.get(fort.ownerId);
    if (!entry) {
      entry = { score: 0, forts: 0 };
      byPlayer.set(fort.ownerId, entry);
    }
    entry.score += weight;
    entry.forts += 1;
  }
  return [...byPlayer.entries()]
    .map(([playerId, { score, forts }]) => ({
      playerId,
      score: Math.round(score * 100) / 100,
      forts
    }))
    .sort((a, b) => b.score - a.score);
};
