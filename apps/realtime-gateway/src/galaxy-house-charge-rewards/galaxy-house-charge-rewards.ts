// House Charges' galaxy reward (docs/house-charges-plan.md, "Rewards"):
// every charge an account held at a crowning adds HOUSE_CHARGE_DOMAIN_WEIGHT
// to its Domain Weight while it holds territory (galaxy-dominion-weight.ts),
// and HOUSE_CHARGE_STIPEND_INFLUENCE to that season's Stipend when it was
// paid one instead (galaxy-stipend-payout.ts).
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { heldHouseChargeCounts } from "@border-empires/shared";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type HeldChargeCountsDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: Pick<GatewayAuthBindingStore, "getByPlayerId">;
};

/** Charges held at every crowning so far, summed per durable account (authUid). Unbound players (AI) are skipped. */
export const heldChargeCountsByAuthUid = async (deps: HeldChargeCountsDeps): Promise<Map<string, number>> => {
  const seasons: Array<{ seasonId: string; counts: Record<string, number> }> = [];
  for (const archive of await deps.listSeasonArchives()) {
    if (archive.houseCharges) seasons.push({ seasonId: archive.seasonId, counts: heldHouseChargeCounts(archive.houseCharges) });
  }
  const current = deps.getCurrentSeasonSummary ? await deps.getCurrentSeasonSummary().catch(() => undefined) : undefined;
  if (current?.status === "ended" && current.seasonHouseCharges && !seasons.some((season) => season.seasonId === current.seasonId)) {
    seasons.push({ seasonId: current.seasonId, counts: heldHouseChargeCounts(current.seasonHouseCharges) });
  }
  const byAuthUid = new Map<string, number>();
  for (const season of seasons) {
    for (const [playerId, held] of Object.entries(season.counts)) {
      const uid = (await deps.authBindingStore.getByPlayerId(playerId))?.uid;
      if (uid) byAuthUid.set(uid, (byAuthUid.get(uid) ?? 0) + held);
    }
  }
  return byAuthUid;
};
