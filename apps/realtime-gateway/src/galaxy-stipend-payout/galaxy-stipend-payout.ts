import type { SeasonGalaxyTierSnapshot } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { TieredSeason } from "../galaxy-holdings/galaxy-holdings.js";

// The whole-number Influence a STIPEND record pays (docs/game-mechanics.md,
// "Galactic layer"). Stipends pay Influence only: galactic Production is a
// per-territory daily build rate, and a Stipend comes with no territory. A
// legacy `production` amount on older archived records is ignored. The
// simulation stores `10 × progress` to two decimals; the ledger works in whole
// units, so it is rounded here once and both the credit and the
// /hq/galaxy/me view use this function -- what HQ shows is what was paid.
export const stipendPayoutAmounts = (tier: Pick<SeasonGalaxyTierSnapshot, "influence">): { influence: number } => ({
  influence: Math.max(0, Math.round(tier.influence ?? 0))
});

// Pays every outstanding Stipend (a one-time Influence payout, no territory) into
// its account's durable galaxy balance. Idempotent per (authUid, seasonId)
// via GalaxyEconomyStore.creditStipendOnce, so it is safe to run on every
// Cycle poll and after every gateway restart.
//
// Backfill: this walks every visible ended season, so Stipends from seasons
// archived before payouts existed are paid on the first poll after deploy --
// they were always owed, just never credited. Records with no bound
// account (AI empires, unclaimed players) are skipped, the same way Outposts
// are; a later binding for that playerId is paid on a later poll.
export const payOutstandingStipends = async ({
  tiered,
  authBindingStore,
  galaxyEconomyStore,
  now
}: {
  tiered: readonly TieredSeason[];
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  now: number;
}): Promise<number> => {
  let paid = 0;
  for (const season of tiered) {
    for (const tier of season.galaxyTiers) {
      if (tier.tier !== "STIPEND") continue;
      const amounts = stipendPayoutAmounts(tier);
      if (amounts.influence === 0) continue;
      const binding = await authBindingStore.getByPlayerId(tier.playerId);
      if (!binding?.uid) continue;
      const credited = await galaxyEconomyStore.creditStipendOnce({
        authUid: binding.uid,
        seasonId: season.seasonId,
        ...amounts,
        now
      });
      if (credited) paid += 1;
    }
  }
  return paid;
};
