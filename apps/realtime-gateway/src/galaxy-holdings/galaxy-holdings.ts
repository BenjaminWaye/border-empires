import type {
  CurrentSeasonSummary,
  GalaxySpecialization,
  SeasonArchiveRow,
  SeasonGalaxyTierSnapshot,
  SeasonWinnerSnapshot
} from "@border-empires/sim-protocol";
import { specializationForVictoryPath } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type WonSeason = {
  seasonId: string;
  seasonSequence: number;
  winner: SeasonWinnerSnapshot;
};

// Seasons carrying galaxyTiers (§3 Outpost/Stipend records for non-winners).
export type TieredSeason = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number;
  galaxyTiers: SeasonGalaxyTierSnapshot[];
};

export type ResolveGalaxyHoldingsDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
};

// Combines archived (rolled-over) seasons with the current season if it has
// ended but hasn't rolled over yet, so a season sitting on the season-end
// screen is visible in the galaxy immediately rather than only after the next
// season successfully starts. Fetches `listSeasonArchives`/`getCurrentSeasonSummary`
// exactly once per call and derives both the winner view (Planets) and the
// galaxyTiers view (Outposts/Stipends) from that single pass.
//
// Moved here (out of galaxy-routes.ts) so the Cycle tick scheduler can share
// the exact same "which seasons are visible" logic as /hq/galaxy/me — a
// divergence there would mean the tick and the UI disagreeing about what an
// empire currently holds.
export const resolveEndedSeasons = async (
  deps: ResolveGalaxyHoldingsDeps
): Promise<{ won: WonSeason[]; tiered: TieredSeason[] }> => {
  const archives = await deps.listSeasonArchives();
  const won: WonSeason[] = [];
  const tiered: TieredSeason[] = [];
  for (const archive of archives) {
    if (archive.winner) won.push({ seasonId: archive.seasonId, seasonSequence: archive.seasonSequence, winner: archive.winner });
    if (archive.galaxyTiers && archive.galaxyTiers.length > 0) {
      tiered.push({ seasonId: archive.seasonId, seasonSequence: archive.seasonSequence, endedAt: archive.endedAt, galaxyTiers: archive.galaxyTiers });
    }
  }

  if (deps.getCurrentSeasonSummary) {
    const current = await deps.getCurrentSeasonSummary();
    if (current.status === "ended") {
      if (current.seasonWinner && !won.some((season) => season.seasonId === current.seasonId)) {
        won.push({ seasonId: current.seasonId, seasonSequence: current.seasonSequence, winner: current.seasonWinner });
      }
      if (current.seasonGalaxyTiers && current.seasonGalaxyTiers.length > 0 && !tiered.some((season) => season.seasonId === current.seasonId)) {
        tiered.push({
          seasonId: current.seasonId,
          seasonSequence: current.seasonSequence,
          endedAt: current.endedAt ?? current.updatedAt,
          galaxyTiers: current.seasonGalaxyTiers
        });
      }
    }
  }
  return { won, tiered };
};

// Resolves the durable authUid that won a given season, or undefined if the
// winner has no bound account (an AI/unclaimed win — "unclaimed frontier").
export const winnerAuthUid = async (season: WonSeason, authBindingStore: GatewayAuthBindingStore): Promise<string | undefined> => {
  const binding = await authBindingStore.getByPlayerId(season.winner.playerId);
  return binding?.uid;
};

export type GalaxyHeldTerritory = {
  seasonId: string;
  tier: "PLANET" | "OUTPOST";
  specialization: GalaxySpecialization;
};

// Builds, for every authUid with at least one held Planet or Outpost, the
// full list of that empire's currently-held territories with specialization
// — the input the Cycle tick needs to compute trickle/upkeep (§13). Stipends
// are deliberately excluded: they're a one-time payout with no territory
// (§3), so they never carry Stability or ongoing trickle/upkeep.
export const resolveGalaxyHoldingsByOwner = async (
  deps: ResolveGalaxyHoldingsDeps & { authBindingStore: GatewayAuthBindingStore }
): Promise<Map<string, GalaxyHeldTerritory[]>> => {
  const { won, tiered } = await resolveEndedSeasons(deps);
  const byOwner = new Map<string, GalaxyHeldTerritory[]>();

  const add = (authUid: string, territory: GalaxyHeldTerritory): void => {
    const list = byOwner.get(authUid);
    if (list) list.push(territory);
    else byOwner.set(authUid, [territory]);
  };

  for (const season of won) {
    const uid = await winnerAuthUid(season, deps.authBindingStore);
    if (!uid) continue;
    add(uid, { seasonId: season.seasonId, tier: "PLANET", specialization: specializationForVictoryPath(season.winner.objectiveId) });
  }

  for (const season of tiered) {
    for (const tier of season.galaxyTiers) {
      if (tier.tier !== "OUTPOST" || !tier.specialization) continue;
      const binding = await deps.authBindingStore.getByPlayerId(tier.playerId);
      if (!binding?.uid) continue;
      add(binding.uid, { seasonId: season.seasonId, tier: "OUTPOST", specialization: tier.specialization });
    }
  }

  return byOwner;
};
