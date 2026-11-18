import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerLastContestRecapRoute } from "./register-last-contest-recap-route.js";

const archive = (seasonId: string, endedAt: number): SeasonArchiveRow => ({
  seasonId, seasonSequence: 1, endedAt, updatedAt: endedAt,
  winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: endedAt, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  finalStandings: [{ id: "player-1", name: "Nauticus", rank: 1, score: 90, tiles: 180, incomePerMinute: 9, techs: 3 }],
  mostTerritory: [], mostPoints: [], longestSurvivalMs: [], replayEvents: [{ type: "big" }]
});

const appWith = async (listSeasonArchives: () => Promise<SeasonArchiveRow[]>) => {
  const app = Fastify();
  registerLastContestRecapRoute(app, { listSeasonArchives });
  await app.ready();
  return app;
};

describe("GET /seasons/last-recap", () => {
  it("returns the newest archive without its replay log", async () => {
    const app = await appWith(async () => [archive("season-2", 2_000), archive("season-1", 1_000)]);
    const response = await app.inject({ method: "GET", url: "/seasons/last-recap" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; recap: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.recap.seasonId).toBe("season-2");
    expect(body.recap.finalStandings).toHaveLength(1);
    expect(body.recap).not.toHaveProperty("replayEvents");
  });

  it("returns a null recap before any contest has ended", async () => {
    const app = await appWith(async () => []);
    expect((await app.inject({ method: "GET", url: "/seasons/last-recap" })).json()).toEqual({ ok: true, recap: null });
  });

  it("reports 503 when archives cannot be loaded", async () => {
    const app = await appWith(async () => { throw new Error("sim down"); });
    const response = await app.inject({ method: "GET", url: "/seasons/last-recap" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "sim down" });
  });
});
