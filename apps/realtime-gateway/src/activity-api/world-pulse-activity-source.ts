import type { ActivityApiResponse, ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import type { PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import { createActivityApiCache } from "./activity-api-cache.js";
import { buildActivityApiResponse } from "./activity-api-response.js";

const WORLD_PULSE_SOURCE_CACHE_TTL_MS = 45_000;

export type WorldPulseActivitySource = () => Promise<{ activity: ActivityApiResponse; seasonId: string }>;

export const createWorldPulseActivitySource = (deps: {
  getActivityDashboard: () => Promise<ActivityDashboardSnapshot>;
  getSeasonPowerScore: () => Promise<{ seasonId: string; powerScore: LeaderboardOverallEntry[] }>;
  getSocialSnapshot: () => SocialStoreSnapshot;
  growthBaselineStore: PlayerGrowthBaselineStore;
  now?: () => number;
}): WorldPulseActivitySource => {
  const cache = createActivityApiCache<Awaited<ReturnType<WorldPulseActivitySource>>>({
    ttlMs: WORLD_PULSE_SOURCE_CACHE_TTL_MS,
    ...(deps.now ? { now: deps.now } : {})
  });
  return async () => {
    const cached = cache.get();
    if (cached) return cached;
    const [dashboard, season] = await Promise.all([deps.getActivityDashboard(), deps.getSeasonPowerScore()]);
    const value = {
      activity: await buildActivityApiResponse({
        dashboard,
        socialSnapshot: deps.getSocialSnapshot(),
        powerScore: season.powerScore,
        growthBaselineStore: deps.growthBaselineStore,
        ...(deps.now ? { now: deps.now() } : {})
      }),
      seasonId: season.seasonId
    };
    cache.set(value);
    return value;
  };
};
