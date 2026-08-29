// Assembles the full GET /api/activity response (ActivityApiResponse, see
// packages/game-domain/src/activity-dashboard-types.ts) from the sim-
// computed ActivityDashboardSnapshot (wars/momentum/swing/hotspots/
// fortification, fetched over the GetActivityDashboard RPC — see
// sim-client.ts), the gateway's own social-state views (alliances/breaks/
// truces — social-activity-views.ts), and the existing leaderboard
// (LeaderboardOverallEntry[], read as-is — no recomputation here).
import type { ActivityApiResponse, ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import { activeAlliancesView, allianceBreaksView, truceWatchView } from "./social-activity-views.js";

export const buildActivityApiResponse = (input: {
  dashboard: ActivityDashboardSnapshot;
  socialSnapshot: SocialStoreSnapshot;
  powerScore: LeaderboardOverallEntry[];
}): ActivityApiResponse => ({
  generatedAt: new Date(input.dashboard.generatedAt).toISOString(),
  alliances: activeAlliancesView(input.socialSnapshot),
  allianceBreaks: allianceBreaksView(input.socialSnapshot),
  truceWatch: truceWatchView(input.socialSnapshot),
  fortification: input.dashboard.fortification,
  wars: input.dashboard.wars,
  territoryMomentum: input.dashboard.territoryMomentum,
  biggestSwing24h: input.dashboard.biggestSwing24h,
  frontlineHotspots: input.dashboard.frontlineHotspots,
  powerScore: input.powerScore
});
