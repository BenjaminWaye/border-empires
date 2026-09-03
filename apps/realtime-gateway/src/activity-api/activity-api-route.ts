// GET /api/activity -- public, unauthenticated cross-player activity feed
// (alliances/breaks/truces, wars, territory momentum/swings/hotspots,
// fortification ranking, power score). See docs/agents/territory-flip-log-
// and-activity-api.md for the full data-flow writeup.
import type { FastifyInstance } from "fastify";
import type { ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import type { PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import { buildActivityApiResponse } from "./activity-api-response.js";
import { createActivityApiCache } from "./activity-api-cache.js";

// Public + pollable, so a short cache absorbs repeated scraping without
// hammering the sim RPC on every hit; short enough that "wars"/"momentum"
// still feel close to live.
const ACTIVITY_API_CACHE_TTL_MS = 45_000;

export type RegisterActivityApiRouteDeps = {
  getActivityDashboardSnapshot: () => Promise<ActivityDashboardSnapshot>;
  getSocialSnapshot: () => SocialStoreSnapshot;
  getPowerScore: () => Promise<LeaderboardOverallEntry[]>;
  growthBaselineStore: PlayerGrowthBaselineStore;
  now?: () => number;
};

export const registerActivityApiRoute = (app: FastifyInstance, deps: RegisterActivityApiRouteDeps): void => {
  const cache = createActivityApiCache<Awaited<ReturnType<typeof buildActivityApiResponse>>>({
    ttlMs: ACTIVITY_API_CACHE_TTL_MS,
    ...(deps.now ? { now: deps.now } : {})
  });

  app.get("/api/activity", async (_request, reply) => {
    const cached = cache.get();
    if (cached) return cached;
    try {
      const [dashboard, powerScore] = await Promise.all([deps.getActivityDashboardSnapshot(), deps.getPowerScore()]);
      const response = await buildActivityApiResponse({
        dashboard,
        socialSnapshot: deps.getSocialSnapshot(),
        powerScore,
        growthBaselineStore: deps.growthBaselineStore,
        ...(deps.now ? { now: deps.now() } : {})
      });
      cache.set(response);
      return response;
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : "failed to build activity dashboard" };
    }
  });
};
