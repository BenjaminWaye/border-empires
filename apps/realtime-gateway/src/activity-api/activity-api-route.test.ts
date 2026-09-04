import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import { registerActivityApiRoute } from "./activity-api-route.js";
import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import { InMemoryPlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";

const dashboard: ActivityDashboardSnapshot = {
  generatedAt: 1_000_000,
  fortification: [{ playerId: "p1", score: 9.25, forts: 2 }],
  wars: [{ playerA: "p1", playerB: "p2", tileFlips24h: 3, lastFlipAt: 900_000 }],
  territoryMomentum: [{ playerId: "p1", tilesGained24h: 5, tilesLost24h: 1, net24h: 4 }],
  biggestSwing24h: { playerId: "p2", tilesLost: 3, windowStart: 0, windowEnd: 1_000_000 },
  frontlineHotspots: [{ tileId: "t-1", x: 5, y: 5, flips24h: 3, contestedBy: ["p1", "p2"] }],
  manpowerLost24h: 15,
  biggestBattle24h: { attackerId: "p2", defenderId: "p1", attackerWon: false, manpowerLoss: 15, x: 9, y: 9, at: 950_000 },
  fiercestAttacker24h: null,
  toughestTarget24h: null
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
  { id: "p1", name: "Alice", tiles: 88, incomePerMinute: 412, techs: 9, manpowerCap: 10170, score: 5230, rank: 1 }
];

const buildApp = () => {
  const app = Fastify();
  const growthBaselineStore = new InMemoryPlayerGrowthBaselineStore();
  registerActivityApiRoute(app, {
    getActivityDashboardSnapshot: async () => dashboard,
    getSocialSnapshot: () => socialSnapshot,
    getPowerScore: async () => powerScore,
    growthBaselineStore,
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
    // p1 is on the leaderboard ("Alice"); p2 is not, so it falls back to its raw id.
    expect(body.fortification).toEqual([{ ...dashboard.fortification[0], playerName: "Alice" }]);
    expect(body.wars).toEqual([{ ...dashboard.wars[0], playerAName: "Alice", playerBName: "p2" }]);
    expect(body.territoryMomentum).toEqual([{ ...dashboard.territoryMomentum[0], playerName: "Alice" }]);
    expect(body.biggestSwing24h).toEqual({ ...dashboard.biggestSwing24h, playerName: "p2" });
    expect(body.frontlineHotspots).toEqual([
      { ...dashboard.frontlineHotspots[0], contestedByNames: ["Alice", "p2"] }
    ]);
    expect(body.manpowerLost24h).toBe(15);
    expect(body.biggestBattle24h).toEqual({ ...dashboard.biggestBattle24h, attackerName: "p2", defenderName: "Alice" });
    // No baseline stored yet on a fresh growthBaselineStore -- growth is
    // empty on the first call (a baseline gets seeded for next time, but
    // there's nothing to diff against yet).
    expect(body.growth).toEqual([]);
    expect(body.powerScore).toEqual(powerScore);
    // Ranked by normalized significance (see daily-story-significance.ts): the
    // alliance events (fixed 80/70) outrank the 15-manpower battle (5/300
    // scale = ~5), which in this fixture ties the standing power leader
    // (fixed 5) but sorts first (stable sort, appears earlier pre-sort).
    // Everything else in this fixture revolves around p1 (Alice) or p2, both
    // already named by the battle/alliance events above, so
    // dedupeByPlayerSet collapses the rest of the digest (Standing,
    // Fastest Expansion, Heaviest Defeat, Open War, Fiercest Fighting) --
    // they'd only be re-narrating players the reader has already been told
    // about.
    expect(body.dailyStory.map((e: { type: string }) => e.type)).toEqual([
      "ALLIANCE_BROKEN",
      "ALLIANCE_FORMED",
      "BLOODIEST_BATTLE"
    ]);
    expect(body.dailyStory[0]).toEqual({
      type: "ALLIANCE_BROKEN",
      headline: "Alliance Broken",
      text: "Alice and p5's alliance was broken by Alice.",
      significance: 80,
      players: ["Alice", "p5"]
    });
  });

  it("reports growth against a baseline seeded a day earlier, but not before then", async () => {
    const growthBaselineStore = new InMemoryPlayerGrowthBaselineStore();
    let now = 0;
    const buildAt = (): ReturnType<typeof Fastify> => {
      const app = Fastify();
      registerActivityApiRoute(app, {
        getActivityDashboardSnapshot: async () => dashboard,
        getSocialSnapshot: () => socialSnapshot,
        getPowerScore: async () => powerScore,
        growthBaselineStore,
        now: () => now
      });
      return app;
    };

    // First call: no baseline yet -- seeds one at `now`, growth stays empty.
    const first = await buildAt().inject({ method: "GET", url: "/api/activity" });
    expect(first.json().growth).toEqual([]);

    // A few hours later: baseline is <24h old, so it's diffed against but
    // not rolled forward yet. incomePerMinute/manpowerCap haven't changed
    // in this fixture, so the delta is exactly zero, not "no data".
    now += 6 * 60 * 60_000;
    const sameDay = await buildAt().inject({ method: "GET", url: "/api/activity" });
    expect(sameDay.json().growth).toEqual([
      { playerId: "p1", playerName: "Alice", incomePerMinute: 412, incomePerMinuteDelta: 0, manpowerCap: 10170, manpowerCapDelta: 0, baselineAt: 0 }
    ]);
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
      growthBaselineStore: new InMemoryPlayerGrowthBaselineStore(),
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
      getPowerScore: async () => powerScore,
      growthBaselineStore: new InMemoryPlayerGrowthBaselineStore()
    });
    const response = await app.inject({ method: "GET", url: "/api/activity" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "rpc unavailable" });
  });
});
