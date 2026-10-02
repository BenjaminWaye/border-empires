import type {
  CurrentSeasonSummary,
  GalaxySpecialization,
  SeasonArchiveRow,
  SeasonGalaxyTierSnapshot,
  SeasonWinnerSnapshot
} from "@border-empires/sim-protocol";
import { specializationForVictoryPath } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { SectorIndexArchive, SectorLabel } from "../galaxy-sector-numbering/galaxy-sector-numbering.js";
import { buildSectorLabelIndex } from "../galaxy-sector-numbering/galaxy-sector-numbering.js";

export type WonSeason = {
  seasonId: string;
  seasonSequence: number;
  winner: SeasonWinnerSnapshot;
  // A won season is always itself the Frontier win that first claimed its
  // territory (a Defense Campaign's own seasonId is excluded below), so this
  // is always resolvable -- never undefined.
  sectorLabel: SectorLabel;
};

// Seasons carrying galaxyTiers (§3 Outpost/Stipend records for non-winners).
export type TieredSeason = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number;
  galaxyTiers: SeasonGalaxyTierSnapshot[];
  // Undefined when this season awarded Stipends without anyone winning
  // outright -- no territory was ever created for it to label.
  sectorLabel: SectorLabel | undefined;
};

export type ResolveGalaxyHoldingsDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  // Optional (§7/§11 Defense Campaign): when wired, a won territory whose
  // ownership has since been transferred (a Defense Campaign for it
  // resolved) resolves to its new owner instead of the season's original
  // winner -- see resolveCurrentOwnerAuthUid. Omitted entirely in any
  // deployment that hasn't wired the Defense Campaign store, in which case
  // ownership behaves exactly as it always has (original winner only).
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
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

  // The in-progress-but-ended current season (if any) has to be folded into
  // the sector-numbering index too, not just into won/tiered below --
  // otherwise its own sector number would be computed as if it didn't exist
  // yet, undercounting it relative to any Frontier win that comes after it.
  const indexInput: SectorIndexArchive[] = archives.map((a) => ({
    seasonId: a.seasonId,
    seasonSequence: a.seasonSequence,
    winner: a.winner,
    defenseCampaignTargetSeasonId: a.defenseCampaignTargetSeasonId
  }));

  const current = deps.getCurrentSeasonSummary ? await deps.getCurrentSeasonSummary() : undefined;
  const currentEnded = current?.status === "ended" ? current : undefined;
  if (currentEnded && !indexInput.some((a) => a.seasonId === currentEnded.seasonId)) {
    indexInput.push({
      seasonId: currentEnded.seasonId,
      seasonSequence: currentEnded.seasonSequence,
      winner: currentEnded.seasonWinner,
      defenseCampaignTargetSeasonId: currentEnded.defenseCampaignTargetSeasonId
    });
  }
  const sectorLabels = buildSectorLabelIndex(indexInput);

  const won: WonSeason[] = [];
  const tiered: TieredSeason[] = [];
  for (const archive of archives) {
    // A Defense Campaign season's own seasonId never becomes an independent
    // Planet (§7/§11) -- its win instead transfers ownership of the
    // *original* territory it targeted (applied by whatever wires
    // recordTransfer at rollover; see galaxy-defense-campaign-scheduler.ts).
    // Excluding it here is what stops a DC's winner from ending up owning
    // both the transferred territory *and* a brand-new one at the DC's own
    // seasonId.
    if (archive.winner && !archive.defenseCampaignTargetSeasonId) {
      const sectorLabel = sectorLabels.get(archive.seasonId);
      // Can't happen: a Frontier win is exactly what buildSectorLabelIndex
      // numbers, but guard rather than silently mislabel if it ever does.
      if (sectorLabel) won.push({ seasonId: archive.seasonId, seasonSequence: archive.seasonSequence, winner: archive.winner, sectorLabel });
    }
    if (archive.galaxyTiers && archive.galaxyTiers.length > 0) {
      tiered.push({
        seasonId: archive.seasonId,
        seasonSequence: archive.seasonSequence,
        endedAt: archive.endedAt,
        galaxyTiers: archive.galaxyTiers,
        sectorLabel: sectorLabels.get(archive.seasonId)
      });
    }
  }

  if (currentEnded) {
    if (currentEnded.seasonWinner && !currentEnded.defenseCampaignTargetSeasonId && !won.some((season) => season.seasonId === currentEnded.seasonId)) {
      const sectorLabel = sectorLabels.get(currentEnded.seasonId);
      if (sectorLabel) {
        won.push({ seasonId: currentEnded.seasonId, seasonSequence: currentEnded.seasonSequence, winner: currentEnded.seasonWinner, sectorLabel });
      }
    }
    if (currentEnded.seasonGalaxyTiers && currentEnded.seasonGalaxyTiers.length > 0 && !tiered.some((season) => season.seasonId === currentEnded.seasonId)) {
      tiered.push({
        seasonId: currentEnded.seasonId,
        seasonSequence: currentEnded.seasonSequence,
        endedAt: currentEnded.endedAt ?? currentEnded.updatedAt,
        galaxyTiers: currentEnded.seasonGalaxyTiers,
        sectorLabel: sectorLabels.get(currentEnded.seasonId)
      });
    }
  }
  return { won, tiered };
};

// Resolves the durable authUid that won a given season, or undefined if the
// winner has no bound account (an AI/unclaimed win — "unclaimed frontier").
// This is the *original* winner only -- see resolveCurrentOwnerAuthUid for
// the transfer-aware version reads should generally prefer.
export const winnerAuthUid = async (season: WonSeason, authBindingStore: GatewayAuthBindingStore): Promise<string | undefined> => {
  const binding = await authBindingStore.getByPlayerId(season.winner.playerId);
  return binding?.uid;
};

// §7/§11: the *current* owner of a territory, honoring a Defense Campaign
// ownership transfer if one has happened, falling back to the original
// winner otherwise. Every galaxy read path that answers "who owns this
// territory right now" should call this instead of winnerAuthUid directly
// -- the one exception on purpose is planet christening (naming rights stay
// with the original winner; renaming a conquered territory is a separate,
// not-yet-scoped question).
export const resolveCurrentOwnerAuthUid = async (
  season: WonSeason,
  authBindingStore: GatewayAuthBindingStore,
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore
): Promise<string | undefined> => {
  if (galaxyDefenseCampaignStore) {
    const transfer = await galaxyDefenseCampaignStore.getTransferForSeasonId(season.seasonId);
    if (transfer) return transfer.currentOwnerAuthUid;
  }
  return winnerAuthUid(season, authBindingStore);
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
    const uid = await resolveCurrentOwnerAuthUid(season, deps.authBindingStore, deps.galaxyDefenseCampaignStore);
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

// Shared "does this empire hold a Planet" predicate -- Outposts alone don't
// qualify. Reused by the Senate proposal eligibility gate
// (galaxy-senate-routes.ts) and by the Duke title (resolveDukeAuthUids
// below) so the two "owns a Planet" checks can't drift apart.
export const holdsPlanetTier = (territories: readonly GalaxyHeldTerritory[] | undefined): boolean =>
  (territories ?? []).some((t) => t.tier === "PLANET");

// Best-effort, bounded wrapper for gateway-app.ts's INIT path: a slow or
// failed holdings read must never block or fail login, so it resolves to an
// empty set (nobody gets the Duke tint on this INIT) instead of throwing.
export const resolveDukeAuthUidsBestEffort = (
  deps: ResolveGalaxyHoldingsDeps & { authBindingStore: GatewayAuthBindingStore },
  timeoutMs: number,
  withTimeout: <T>(promise: Promise<T>, ms: number, label: string) => Promise<T>
): Promise<Set<string>> =>
  withTimeout(resolveDukeAuthUids(deps), timeoutMs, "resolveDukeAuthUids").catch(() => new Set<string>());

// The "Duke" title: every authUid currently holding at least one Planet,
// across all seasons -- a persistent, cross-season honor, not tied to any
// single in-match tile. Built on the same holdings resolution the Senate
// eligibility gate already uses.
export const resolveDukeAuthUids = async (
  deps: ResolveGalaxyHoldingsDeps & { authBindingStore: GatewayAuthBindingStore }
): Promise<Set<string>> => {
  const holdingsByOwner = await resolveGalaxyHoldingsByOwner(deps);
  const dukes = new Set<string>();
  for (const [authUid, territories] of holdingsByOwner) {
    if (holdsPlanetTier(territories)) dukes.add(authUid);
  }
  return dukes;
};
