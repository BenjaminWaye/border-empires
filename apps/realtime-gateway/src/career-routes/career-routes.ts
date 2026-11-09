import type { FastifyInstance } from "fastify";
import type { SeasonParticipationRow } from "@border-empires/sim-protocol";

export type RegisterCareerRoutesDeps = {
  getSeasonParticipationForPlayer?: (playerId: string) => Promise<SeasonParticipationRow[]>;
};

export type CareerStatsView = {
  seasonsPlayed: number;
  bestRank: number | null;
  peakScore: number | null;
  peakTiles: number | null;
  /** Season-end ELO after the player's most recent rated season. */
  rating: number | null;
  /** Rating change from that most recent rated season. */
  lastRatingDelta: number | null;
  peakRating: number | null;
  seasons: Array<Pick<SeasonParticipationRow, "seasonId" | "seasonSequence" | "rank" | "score" | "tiles" | "endedAt" | "ratingBefore" | "ratingAfter">>;
};

const ratingSummary = (rows: readonly SeasonParticipationRow[]): Pick<CareerStatsView, "rating" | "lastRatingDelta" | "peakRating"> => {
  const rated = rows
    .filter((row): row is SeasonParticipationRow & { ratingBefore: number; ratingAfter: number } =>
      typeof row.ratingBefore === "number" && typeof row.ratingAfter === "number")
    .sort((a, b) => b.endedAt - a.endedAt);
  const latest = rated[0];
  if (!latest) return { rating: null, lastRatingDelta: null, peakRating: null };
  return {
    rating: latest.ratingAfter,
    lastRatingDelta: latest.ratingAfter - latest.ratingBefore,
    peakRating: Math.max(...rated.map((row) => row.ratingAfter))
  };
};

// Public, unauthenticated -- same reasoning as GET /hq/galaxy/by-player/:playerId
// (galaxy-routes.ts): the player profile page needs to show any player's
// career stats, not just the viewer's own. Sourced from the simulation's
// season_participation table (every player's full-leaderboard snapshot at
// season end, not the top-5 truncated into season_archive), so "seasons
// played" and "best rank" are accurate for any player, not just top finishers.
export const registerCareerRoutes = (app: FastifyInstance, deps: RegisterCareerRoutesDeps): void => {
  app.get("/hq/career/by-player/:playerId", async (request, reply) => {
    if (!deps.getSeasonParticipationForPlayer) {
      reply.code(503);
      return { ok: false, error: "career stats are unavailable" };
    }
    const playerId = (request.params as { playerId?: string }).playerId;
    if (!playerId) {
      reply.code(400);
      return { ok: false, error: "playerId is required" };
    }
    const rows = await deps.getSeasonParticipationForPlayer(playerId);
    const view: CareerStatsView = {
      seasonsPlayed: rows.length,
      bestRank: rows.length > 0 ? Math.min(...rows.map((row) => row.rank)) : null,
      peakScore: rows.length > 0 ? Math.max(...rows.map((row) => row.score)) : null,
      peakTiles: rows.length > 0 ? Math.max(...rows.map((row) => row.tiles)) : null,
      ...ratingSummary(rows),
      seasons: rows
        .map((row) => ({
          seasonId: row.seasonId, seasonSequence: row.seasonSequence, rank: row.rank, score: row.score, tiles: row.tiles, endedAt: row.endedAt,
          ...(typeof row.ratingBefore === "number" && typeof row.ratingAfter === "number" ? { ratingBefore: row.ratingBefore, ratingAfter: row.ratingAfter } : {})
        }))
        .sort((a, b) => b.endedAt - a.endedAt)
    };
    return view;
  });
};
