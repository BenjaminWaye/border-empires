import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import { registerActivityApiRoute } from "./activity-api-route.js";
import type { SocialStoreSnapshot } from "../social-store/social-store.js";

const dashboard: ActivityDashboardSnapshot = {
  generatedAt: 1_000_000,
  fortification: [{ playerId: "p1", score: 9.25, forts: 2, garrisonFillPct: 0.75 }],
  wars: [{ playerA: "p1", playerB: "p2", tileFlips24h: 3, lastFlipAt: 900_000 }],
  territoryMomentum: [{ playerId: "p1", tilesGained24h: 5, tilesLost24h: 1, net24h: 4 }],
  biggestSwing24h: { playerId: "p2", tilesLost: 3, windowStart: 0, windowEnd: 1_000_000 },
  frontlineHotspots: [{ tileId: "t-1", x: 5, y: 5, flips24h: 3, contestedBy: ["p1", "p2"] }]
};

const socialSnapshot: SocialStoreSnapshot = {
  players: [],
  allianceRecords: [{ playerAId: "p3", playerBId: "p4", createdAt: 500_000 }],
  allianceRequests: [],
  activeAllianceBreaks: [{ playerAId: "p1", playerBId: "p5", startedAt: 700_000, endsAt: 780_000, createdByPlayerId: "p1" }],
  completedAllianceBreaks: [],
  truceRequests: [],
  activeTruces: [{ playerAId: "p2", playerBId: "p6", startedAt: 600_000, endsAt: 900_000, createdByPlayerId: "p2" }],
  truceLockouts: []
};

const powerScore: LeaderboardOverallEntry[] = [
  { id: "p1", name: "Alice", tiles: 88, incomePerMinute: 412, techs: 9, score: 5230, rank: 1 }
];

const buildApp = () => {
  const app = Fastify();
  registerActivityApiRoute(app, {
    getActivityDashboardSnapshot: async () => dashboard,
    getSocialSnapshot: () => socialSnapshot,
    getPowerScore: async () => powerScore,
    now: () => 1_000_000
  });
  return app;
};

describe("GET /api/activity", () => {
  it("assembles the full response shape from sim + social + leaderboard data", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/activity" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.generatedAt).toBe(new Date(1_000_000).toISOString());
    expect(body.alliances).toEqual([{ playerA: "p3", playerB: "p4", since: 500_000 }]);
    expect(body.allianceBreaks).toEqual([
      { playerA: "p1", playerB: "p5", brokenBy: "p1", brokenAt: 700_000, noticeEndsAt: 780_000 }
    ]);
    expect(body.truceWatch).toEqual([{ playerA: "p2", playerB: "p6", endsAt: 900_000 }]);
    expect(body.fortification).toEqual(dashboard.fortification);
    expect(body.wars).toEqual(dashboard.wars);
    expect(body.territoryMomentum).toEqual(dashboard.territoryMomentum);
    expect(body.biggestSwing24h).toEqual(dashboard.biggestSwing24h);
    expect(body.frontlineHotspots).toEqual(dashboard.frontlineHotspots);
    expect(body.powerScore).toEqual(powerScore);
  });

  it("serves a cached response within the TTL without re-fetching", async () => {
    const app = Fastify();
    let dashboardCalls = 0;
    let now = 0;
    registerActivityApiRoute(app, {
      getActivityDashboardSnapshot: async () => {
        dashboardCalls += 1;
        return dashboard;
      },
      getSocialSnapshot: () => socialSnapshot,
      getPowerScore: async () => powerScore,
      now: () => now
    });
    await app.inject({ method: "GET", url: "/api/activity" });
    now += 1_000;
    await app.inject({ method: "GET", url: "/api/activity" });
    expect(dashboardCalls).toBe(1);
  });

  it("returns 503 with an error body if the sim RPC fails", async () => {
    const app = Fastify();
    registerActivityApiRoute(app, {
      getActivityDashboardSnapshot: async () => {
        throw new Error("rpc unavailable");
      },
      getSocialSnapshot: () => socialSnapshot,
      getPowerScore: async () => powerScore
    });
    const response = await app.inject({ method: "GET", url: "/api/activity" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "rpc unavailable" });
  });
});
