// Player-facing name for a season: players know it as a "Sector Contest"
// (docs/lore/galactic-lore.md §2). Season ids are "season-<sequence>"
// (apps/simulation/src/season-lifecycle.ts); showing the raw id produced
// labels like "Season season-7". Code identifiers keep "season".
export const sectorContestLabel = (seasonId: string | undefined): string => {
  const sequence = seasonId?.match(/^season-(\d+)$/)?.[1];
  if (sequence) return `Sector Contest ${sequence}`;
  return seasonId ? `Sector Contest ${seasonId}` : "the current Sector Contest";
};
