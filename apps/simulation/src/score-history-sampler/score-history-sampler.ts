// Bounded, in-memory rolling sampler for per-player season score-over-time,
// feeding the season-ended screen's score graph (packages/client/src/
// client-season-end-overlay.ts). There is no existing time-series
// persistence anywhere in the stack (sim/gateway/shared/game-domain/
// client-protocol all grepped clean) -- this is the first one, so it must
// follow docs/agents/state-and-persistence-discipline.md from the start:
//
//   - Piggybacks on the existing global-status broadcast cadence (see
//     global-status-broadcast-scheduler.ts) rather than adding a new timer
//     or any per-tick work -- `sample()` is called from
//     performGlobalStatusBroadcast on every broadcast, but is a no-op unless
//     the coarse SCORE_HISTORY_SAMPLE_INTERVAL_MS has elapsed since the last
//     sample, so the broadcast's own (much shorter) cadence never matters.
//   - The primary bound is that time-based interval, sized for how long a
//     season actually runs: seasons last ~30 days, and SCORE_HISTORY_SAMPLE_
//     INTERVAL_MS (8h) yields ~90 points per player over a full 30-day season
//     (30 * 24 / 8 = 90) -- comfortably in the "a graph line, not a scatter
//     plot, and not just a handful of dots" 60-100 range the season-end
//     score graph needs, without relying on a fast interval that would only
//     stay bounded via after-the-fact truncation.
//   - SCORE_HISTORY_MAX_POINTS (200) is a hard per-player point-count cap
//     kept as defense in depth (same shape as territory-flip-log.ts's dual
//     bound) in case a season runs well past its normal 30 days -- it is a
//     safety ceiling, not the mechanism the design relies on day to day.
//   - Not checkpoint/snapshot state -- this is a pure activity feed, rebuilt
//     empty on restart (acceptable: a restart mid-season just means "score
//     graph starts from here"). The one place it DOES get persisted is
//     alongside the crowned season winner (see season-crowning.ts), the same
//     pattern SeasonWinnerSnapshot.seasonStats already uses, so a client
//     that connects after crowning still gets the full graph via INIT.
//   - Reset on season-id change so a new season doesn't inherit the previous
//     season's history.
export const SCORE_HISTORY_SAMPLE_INTERVAL_MS = 8 * 60 * 60_000; // one sample per player every 8h -- ~90 points over a full 30-day season
export const SCORE_HISTORY_MAX_POINTS = 200; // defense-in-depth ceiling (>2x a normal season's ~90 points), not the primary bound

export type ScoreHistoryPoint = { t: number; score: number };

export type ScoreHistorySeries = {
  playerId: string;
  playerName: string;
  points: ScoreHistoryPoint[];
};

export type ScoreHistoryGauge = {
  playerCount: number;
  totalPoints: number;
  capHits: number;
};

export type ScoreHistorySampleEntry = { id: string; name: string; score: number };

export type ScoreHistorySampler = {
  /** No-op unless the sample interval has elapsed or the season changed. */
  sample: (seasonId: string, now: number, entries: readonly ScoreHistorySampleEntry[]) => void;
  /** Current in-memory series for the given season, or [] if it isn't the tracked season. */
  seriesFor: (seasonId: string) => ScoreHistorySeries[];
  gauge: () => ScoreHistoryGauge;
};

export const createScoreHistorySampler = (): ScoreHistorySampler => {
  let trackedSeasonId: string | undefined;
  let lastSampledAt = -Infinity;
  let capHits = 0;
  let seriesByPlayerId = new Map<string, ScoreHistorySeries>();

  const sample: ScoreHistorySampler["sample"] = (seasonId, now, entries) => {
    if (seasonId !== trackedSeasonId) {
      trackedSeasonId = seasonId;
      seriesByPlayerId = new Map();
      capHits = 0; // gauge reflects only the tracked season, not carried-over history from a prior one
      // -Infinity, not 0: a fresh season must take its first sample
      // immediately, not wait out a full SCORE_HISTORY_SAMPLE_INTERVAL_MS
      // from epoch (which `now - 0 < interval` would otherwise do for any
      // `now` under ~8h of real/test time since 1970).
      lastSampledAt = -Infinity;
    }
    if (now - lastSampledAt < SCORE_HISTORY_SAMPLE_INTERVAL_MS) return;
    lastSampledAt = now;
    for (const entry of entries) {
      let series = seriesByPlayerId.get(entry.id);
      if (!series) {
        series = { playerId: entry.id, playerName: entry.name, points: [] };
        seriesByPlayerId.set(entry.id, series);
      }
      series.playerName = entry.name;
      series.points.push({ t: now, score: entry.score });
      if (series.points.length > SCORE_HISTORY_MAX_POINTS) {
        capHits += 1;
        series.points = series.points.slice(series.points.length - SCORE_HISTORY_MAX_POINTS);
      }
    }
  };

  return {
    sample,
    seriesFor: (seasonId) => (seasonId === trackedSeasonId ? [...seriesByPlayerId.values()].map((s) => ({ ...s, points: [...s.points] })) : []),
    gauge: (): ScoreHistoryGauge => ({
      playerCount: seriesByPlayerId.size,
      totalPoints: [...seriesByPlayerId.values()].reduce((sum, series) => sum + series.points.length, 0),
      capHits
    })
  };
};
