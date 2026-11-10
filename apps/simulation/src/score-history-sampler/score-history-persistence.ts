// Boot-time re-seed of the score-history sampler from the persisted current
// season summary. MUST run before the boot-time recomputeAndPersistCurrentSummary:
// that call persists the sampler's current series as the summary's
// scoreHistory, so restoring afterwards would let this process's empty
// sampler overwrite the stored timeline (the cause of crowned seasons having
// only one score sample per empire -- see score-history-sampler.ts).
import type { SeasonSummaryStore } from "../season-summary-store.js";
import type { ScoreHistorySampler, ScoreHistorySeries } from "./score-history-sampler.js";

export const restoreScoreHistory = async (
  store: Pick<SeasonSummaryStore, "loadCurrentSummary">,
  seasonId: string,
  sampler: Pick<ScoreHistorySampler, "restore">
): Promise<void> => {
  const persisted = await store.loadCurrentSummary();
  if (!persisted || persisted.seasonId !== seasonId) return;
  const series = persisted.seasonWinner?.scoreHistory ?? persisted.scoreHistory;
  if (series && series.length > 0) sampler.restore(seasonId, series);
};

/** Crowning: force one last sample of the final scores, then return the series to persist on the winner. */
export const finalScoreHistory = (
  sampler: Pick<ScoreHistorySampler, "sample" | "seriesFor">,
  seasonId: string,
  now: number,
  overall: readonly { id: string; name: string; score: number }[]
): ScoreHistorySeries[] => {
  sampler.sample(seasonId, now, overall.map((entry) => ({ id: entry.id, name: entry.name, score: entry.score })), { force: true });
  return sampler.seriesFor(seasonId);
};
