// House Charges' galaxy reward (docs/house-charges-plan.md, "Rewards"):
// a charge held at a crowning adds HOUSE_CHARGE_STIPEND_INFLUENCE to that
// season's Stipend when the player was paid one (galaxy-stipend-payout.ts);
// otherwise it adds HOUSE_CHARGE_DOMAIN_WEIGHT to the account's Domain Weight
// while it holds territory (galaxy-dominion-weight.ts). Never both.
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { heldHouseChargeCounts } from "@border-empires/shared";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type HeldChargeCountsDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: Pick<GatewayAuthBindingStore, "getByPlayerId">;
};

/**
 * Domain Weight counts, per durable account (authUid): charges held at every
 * crowning so far, except a season where that player was paid a Stipend, whose
 * charges already paid out as Stipend Influence (no double reward). Unbound
 * players (AI) are skipped. Each player id is resolved once.
 */
export const heldChargeCountsByAuthUid = async (deps: HeldChargeCountsDeps): Promise<Map<string, number>> => {
  type CrownedSeason = { seasonId: string; houses: SeasonArchiveRow["houseCharges"]; tiers: SeasonArchiveRow["galaxyTiers"] };
  const seasons: CrownedSeason[] = [];
  for (const archive of await deps.listSeasonArchives()) {
    if (archive.houseCharges) seasons.push({ seasonId: archive.seasonId, houses: archive.houseCharges, tiers: archive.galaxyTiers });
  }
  const current = deps.getCurrentSeasonSummary ? await deps.getCurrentSeasonSummary().catch(() => undefined) : undefined;
  if (current?.status === "ended" && current.seasonHouseCharges && !seasons.some((season) => season.seasonId === current.seasonId)) {
    seasons.push({ seasonId: current.seasonId, houses: current.seasonHouseCharges, tiers: current.seasonGalaxyTiers });
  }
  const uidByPlayerId = new Map<string, string | undefined>();
  const byAuthUid = new Map<string, number>();
  for (const season of seasons) {
    const stipendPlayers = new Set((season.tiers ?? []).filter((tier) => tier.tier === "STIPEND").map((tier) => tier.playerId));
    for (const [playerId, held] of Object.entries(heldHouseChargeCounts(season.houses))) {
      if (stipendPlayers.has(playerId)) continue;
      if (!uidByPlayerId.has(playerId)) uidByPlayerId.set(playerId, (await deps.authBindingStore.getByPlayerId(playerId))?.uid);
      const uid = uidByPlayerId.get(playerId);
      if (uid) byAuthUid.set(uid, (byAuthUid.get(uid) ?? 0) + held);
    }
  }
  return byAuthUid;
};
