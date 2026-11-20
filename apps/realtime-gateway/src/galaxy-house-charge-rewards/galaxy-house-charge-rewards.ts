// House Charges' galaxy reward (docs/house-charges-plan.md, "Rewards"): each
// charge held at a crowning banks Domain score on the account, one per difficulty pip
// (houseChargeDomainForPips). Every account banks it, with or
// without territory in space; it counts in the Court's Domain Weight and in
// Senate vote weight once the account holds territory there.
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { heldHouseChargeDomainWeights } from "@border-empires/shared";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type HeldChargeDomainDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: Pick<GatewayAuthBindingStore, "getByPlayerId">;
};

/**
 * Domain score banked from House Charges, per durable account (authUid),
 * summed over every crowning so far (archived seasons plus an ended current
 * season not yet archived). Unbound players (AI) are skipped. Each player id
 * is resolved once.
 */
export const chargeDomainWeightByAuthUid = async (deps: HeldChargeDomainDeps): Promise<Map<string, number>> => {
  const seasons = new Map<string, SeasonArchiveRow["houseCharges"]>();
  for (const archive of await deps.listSeasonArchives()) {
    if (archive.houseCharges) seasons.set(archive.seasonId, archive.houseCharges);
  }
  const current = deps.getCurrentSeasonSummary ? await deps.getCurrentSeasonSummary().catch(() => undefined) : undefined;
  if (current?.status === "ended" && current.seasonHouseCharges && !seasons.has(current.seasonId)) {
    seasons.set(current.seasonId, current.seasonHouseCharges);
  }
  const uidByPlayerId = new Map<string, string | undefined>();
  const byAuthUid = new Map<string, number>();
  for (const houses of seasons.values()) {
    for (const [playerId, weight] of Object.entries(heldHouseChargeDomainWeights(houses))) {
      if (!uidByPlayerId.has(playerId)) uidByPlayerId.set(playerId, (await deps.authBindingStore.getByPlayerId(playerId))?.uid);
      const uid = uidByPlayerId.get(playerId);
      if (uid) byAuthUid.set(uid, (byAuthUid.get(uid) ?? 0) + weight);
    }
  }
  return byAuthUid;
};
