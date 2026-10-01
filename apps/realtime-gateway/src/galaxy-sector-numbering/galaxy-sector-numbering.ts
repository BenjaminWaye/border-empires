import type { SeasonWinnerSnapshot } from "@border-empires/sim-protocol";

// The only fields buildSectorLabelIndex needs -- narrower than
// SeasonArchiveRow so a caller folding in an in-progress
// CurrentSeasonSummary (which has no mostTerritory/mostPoints/etc.) doesn't
// have to fabricate unrelated required fields just to build one of these.
export type SectorIndexArchive = {
  seasonId: string;
  seasonSequence: number;
  // `| undefined` alongside the `?` because exactOptionalPropertyTypes is on
  // and callers build these by spreading a SeasonArchiveRow/CurrentSeasonSummary
  // field through directly (assigning the key with an undefined value),
  // rather than omitting the key entirely.
  winner?: SeasonWinnerSnapshot | undefined;
  defenseCampaignTargetSeasonId?: string | undefined;
};

// Player-facing "Sector" numbering (docs/galactic-campaign-design.md): a
// territory's permanent identity is already its original claiming season's
// seasonId (see galaxy-defense-campaign-store.ts's originalSeasonId), so no
// new persisted id is introduced here. Both numbers below are pure derived
// ranks over the archive list every caller already has -- there is no
// stored counter, so there is nothing to migrate/backfill and no way for
// two servers to disagree about a rank.
export type SectorCampaign = { kind: "FRONTIER" } | { kind: "CONTESTATION"; ordinal: number };

export type SectorLabel = {
  // 1-based, gapless rank among Frontier wins only, ordered by
  // seasonSequence -- a clean count of distinct territories ever claimed,
  // deliberately NOT the raw seasonSequence (which also counts Defense
  // Campaign seasons and would leave gaps).
  sectorNumber: number;
  campaign: SectorCampaign;
};

const isFrontierWin = (archive: SectorIndexArchive): boolean => Boolean(archive.winner) && !archive.defenseCampaignTargetSeasonId;

// One O(n log n) pass over every archive, keyed by each archive's own
// seasonId so callers can look up the label for whichever season they're
// currently rendering (a Frontier win, or a Defense Campaign fought over an
// earlier one). Archives that are neither a Frontier win nor a Defense
// Campaign targeting a known Frontier win are omitted from the result --
// callers should treat a missing entry as "no sector label available" (e.g.
// an ordinary season nobody won outright, which awarded Stipends but never
// created a territory).
export const buildSectorLabelIndex = (archives: readonly SectorIndexArchive[]): Map<string, SectorLabel> => {
  const index = new Map<string, SectorLabel>();

  const frontierWins = archives.filter(isFrontierWin).slice().sort((a, b) => a.seasonSequence - b.seasonSequence);
  const sectorNumberBySeasonId = new Map<string, number>();
  frontierWins.forEach((archive, i) => {
    const sectorNumber = i + 1;
    sectorNumberBySeasonId.set(archive.seasonId, sectorNumber);
    index.set(archive.seasonId, { sectorNumber, campaign: { kind: "FRONTIER" } });
  });

  const contestationsByTarget = new Map<string, SectorIndexArchive[]>();
  for (const archive of archives) {
    if (!archive.defenseCampaignTargetSeasonId) continue;
    const list = contestationsByTarget.get(archive.defenseCampaignTargetSeasonId);
    if (list) list.push(archive);
    else contestationsByTarget.set(archive.defenseCampaignTargetSeasonId, [archive]);
  }

  for (const [targetSeasonId, contestations] of contestationsByTarget) {
    const sectorNumber = sectorNumberBySeasonId.get(targetSeasonId);
    // Defensive only -- a Defense Campaign should never target a season that
    // isn't a recorded Frontier win, but an unresolvable target must not
    // throw here since this runs on every galaxy read.
    if (sectorNumber === undefined) continue;
    contestations
      .slice()
      .sort((a, b) => a.seasonSequence - b.seasonSequence)
      .forEach((archive, i) => {
        index.set(archive.seasonId, { sectorNumber, campaign: { kind: "CONTESTATION", ordinal: i + 1 } });
      });
  }

  return index;
};
