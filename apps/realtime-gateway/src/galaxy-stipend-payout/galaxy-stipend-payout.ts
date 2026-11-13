import type { SeasonGalaxyTierSnapshot } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { TieredSeason } from "../galaxy-holdings/galaxy-holdings.js";

// The whole-number Influence/Production a STIPEND record pays (§3/§13). The
// simulation stores `10 × progress` / `40 × progress` to two decimals; the
// galaxy ledger works in whole units, so the payout is rounded here once and
// both the credit and the /hq/galaxy/me view use this same function -- what
// HQ shows is exactly what was paid.
export const stipendPayoutAmounts = (tier: Pick<SeasonGalaxyTierSnapshot, "influence" | "production">): { influence: number; production: number } => ({
  influence: Math.max(0, Math.round(tier.influence ?? 0)),
  production: Math.max(0, Math.round(tier.production ?? 0))
});

// Pays every outstanding Stipend (§3: a one-time payout, no territory) into
// its account's durable galaxy balance. Idempotent per (authUid, seasonId)
// via GalaxyEconomyStore.creditStipendOnce, so it is safe to run on every
// Cycle poll and after every gateway restart.
//
// Backfill: this walks every visible ended season, so Stipends from seasons
// archived before payouts existed are paid on the first poll after deploy --
// they were always owed (§13), just never credited. Records with no bound
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
      if (amounts.influence === 0 && amounts.production === 0) continue;
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
