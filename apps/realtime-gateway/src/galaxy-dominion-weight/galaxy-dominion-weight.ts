import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";
import { computeDominionVoteWeight } from "../galaxy-senate-tick/galaxy-senate-tick.js";

export type ResolveGalaxyDominionWeightsDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
};

// Shared by the Senate resolution scheduler (needs every empire's weight,
// once per tick) and the vote-casting route (needs one voter's weight, on
// demand) so the "count Planets/Outposts, sum Stability, feed
// computeDominionVoteWeight" logic exists in exactly one place. Ensures a
// Stability row for every territory it touches (ensureStability), matching
// the same lazy-seeding pattern galaxy-cycle-scheduler.ts and /hq/galaxy/me
// already use.
export const resolveGalaxyDominionWeights = async (
  deps: ResolveGalaxyDominionWeightsDeps
): Promise<Map<string, number>> => {
  const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
    listSeasonArchives: deps.listSeasonArchives,
    ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
    authBindingStore: deps.authBindingStore
  });
  const weightByAuthUid = new Map<string, number>();
  for (const [authUid, territories] of holdingsByOwner) {
    let planets = 0;
    let outposts = 0;
    let totalStability = 0;
    for (const territory of territories) {
      if (territory.tier === "PLANET") planets += 1;
      else outposts += 1;
      const stability = await deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: territory.seasonId, tier: territory.tier });
      totalStability += stability.stability;
    }
    weightByAuthUid.set(authUid, computeDominionVoteWeight({ planets, outposts, totalStability }));
  }
  return weightByAuthUid;
};
