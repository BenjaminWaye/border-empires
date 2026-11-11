import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonParticipationRow } from "@border-empires/sim-protocol";

import { registerCareerRoutes } from "./career-routes.js";

const row = (overrides: Partial<SeasonParticipationRow> = {}): SeasonParticipationRow => ({
  seasonId: "season-1",
  seasonSequence: 1,
  playerId: "player-1",
  playerName: "Nauticus",
  rank: 3,
  score: 40,
  tiles: 20,
  incomePerMinute: 4,
  techs: 2,
  endedAt: 1_000,
  ...overrides
});

const buildApp = (rowsByPlayerId: Record<string, SeasonParticipationRow[]>) => {
  const app = Fastify();
  registerCareerRoutes(app, {
    getSeasonParticipationForPlayer: async (playerId: string) => rowsByPlayerId[playerId] ?? []
  });
  return app;
};

describe("GET /hq/career/by-player/:playerId", () => {
  it("aggregates seasons played, best rank, and peak stats across seasons", async () => {
    const app = buildApp({
      "player-1": [
        row({ seasonId: "season-1", seasonSequence: 1, rank: 5, score: 40, tiles: 20, endedAt: 1_000 }),
        row({ seasonId: "season-2", seasonSequence: 2, rank: 1, score: 90, tiles: 15, endedAt: 2_000 })
      ]
    });

    const response = await app.inject({ method: "GET", url: "/hq/career/by-player/player-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      seasonsPlayed: 2,
      bestRank: 1,
      peakScore: 90,
      peakTiles: 20,
      rating: null,
      lastRatingDelta: null,
      peakRating: null,
      seasons: [
        { seasonId: "season-2", seasonSequence: 2, rank: 1, score: 90, tiles: 15, endedAt: 2_000 },
        { seasonId: "season-1", seasonSequence: 1, rank: 5, score: 40, tiles: 20, endedAt: 1_000 }
      ]
    });
  });

  it("returns zeroed-out stats for a player with no season history", async () => {
    const app = buildApp({});
    const response = await app.inject({ method: "GET", url: "/hq/career/by-player/player-unknown" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ seasonsPlayed: 0, bestRank: null, peakScore: null, peakTiles: null, rating: null, lastRatingDelta: null, peakRating: null, seasons: [] });
  });

  it("reports the latest season-end rating, its delta, and the peak rating", async () => {
    const app = buildApp({
      "player-1": [
        row({ seasonId: "season-1", endedAt: 1_000, ratingBefore: 1200, ratingAfter: 1240 }),
        row({ seasonId: "season-2", endedAt: 2_000, ratingBefore: 1240, ratingAfter: 1225 }),
        row({ seasonId: "season-0", endedAt: 500 })
      ]
    });
    const body = (await app.inject({ method: "GET", url: "/hq/career/by-player/player-1" })).json();
    expect(body.rating).toBe(1225);
    expect(body.lastRatingDelta).toBe(-15);
    expect(body.peakRating).toBe(1240);
    expect(body.seasons[0]).toMatchObject({ seasonId: "season-2", ratingBefore: 1240, ratingAfter: 1225 });
    expect(body.seasons[2]).not.toHaveProperty("ratingAfter");
  });

  it("returns 503 when career stats aren't wired up", async () => {
    const app = Fastify();
    registerCareerRoutes(app, {});
    const response = await app.inject({ method: "GET", url: "/hq/career/by-player/player-1" });
    expect(response.statusCode).toBe(503);
  });
});
