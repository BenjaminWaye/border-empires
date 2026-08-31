// Assembles the full GET /api/activity response (ActivityApiResponse, see
// packages/game-domain/src/activity-dashboard-types.ts) from the sim-
// computed ActivityDashboardSnapshot (wars/momentum/swing/hotspots/
// fortification, fetched over the GetActivityDashboard RPC — see
// sim-client.ts), the gateway's own social-state views (alliances/breaks/
// truces — social-activity-views.ts), and the existing leaderboard
// (LeaderboardOverallEntry[], read as-is — no recomputation here).
import type { ActivityApiResponse, ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import { buildPlayerNameResolver } from "./activity-api-player-names.js";
import { activeAlliancesView, allianceBreaksView, truceWatchView } from "./social-activity-views.js";

export const buildActivityApiResponse = (input: {
  dashboard: ActivityDashboardSnapshot;
  socialSnapshot: SocialStoreSnapshot;
  powerScore: LeaderboardOverallEntry[];
}): ActivityApiResponse => {
  const nameFor = buildPlayerNameResolver(input.powerScore);
  return {
    generatedAt: new Date(input.dashboard.generatedAt).toISOString(),
    alliances: activeAlliancesView(input.socialSnapshot),
    allianceBreaks: allianceBreaksView(input.socialSnapshot),
    truceWatch: truceWatchView(input.socialSnapshot),
    fortification: input.dashboard.fortification.map((entry) => ({ ...entry, playerName: nameFor(entry.playerId) })),
    wars: input.dashboard.wars.map((war) => ({
      ...war,
      playerAName: nameFor(war.playerA),
      playerBName: nameFor(war.playerB)
    })),
    territoryMomentum: input.dashboard.territoryMomentum.map((entry) => ({
      ...entry,
      playerName: nameFor(entry.playerId)
    })),
    biggestSwing24h:
      input.dashboard.biggestSwing24h === null
        ? null
        : { ...input.dashboard.biggestSwing24h, playerName: nameFor(input.dashboard.biggestSwing24h.playerId) },
    frontlineHotspots: input.dashboard.frontlineHotspots.map((hotspot) => ({
      ...hotspot,
      contestedByNames: hotspot.contestedBy.map(nameFor)
    })),
    powerScore: input.powerScore
  };
};
