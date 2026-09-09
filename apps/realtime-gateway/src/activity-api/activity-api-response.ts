// Assembles the full GET /api/activity response (ActivityApiResponse, see
// packages/game-domain/src/activity-dashboard-types.ts) from the sim-
// computed ActivityDashboardSnapshot (wars/momentum/swing/hotspots/
// fortification, fetched over the GetActivityDashboard RPC — see
// sim-client.ts), the gateway's own social-state views (alliances/breaks/
// truces — social-activity-views.ts), and the existing leaderboard
// (LeaderboardOverallEntry[], read as-is — no recomputation here).
import type { ActivityApiResponse, ActivityDashboardSnapshot, LeaderboardOverallEntry } from "@border-empires/game-domain";

import type { SocialStoreSnapshot } from "../social-store/social-store.js";
import type { PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import { buildPlayerNameResolver } from "./activity-api-player-names.js";
import { buildDailyStory } from "./daily-story.js";
import { computePlayerGrowth } from "./player-growth.js";
import { activeAlliancesView, allianceBreaksView, truceWatchView } from "./social-activity-views.js";

export const buildActivityApiResponse = async (input: {
  dashboard: ActivityDashboardSnapshot;
  socialSnapshot: SocialStoreSnapshot;
  powerScore: LeaderboardOverallEntry[];
  growthBaselineStore: PlayerGrowthBaselineStore;
  now?: number;
}): Promise<ActivityApiResponse> => {
  const now = input.now ?? Date.now();
  const nameFor = buildPlayerNameResolver(input.powerScore);
  const alliances = activeAlliancesView(input.socialSnapshot);
  const allianceBreaks = allianceBreaksView(input.socialSnapshot);
  const fortification = input.dashboard.fortification.map((entry) => ({ ...entry, playerName: nameFor(entry.playerId) }));
  const wars = input.dashboard.wars.map((war) => ({
    ...war,
    playerAName: nameFor(war.playerA),
    playerBName: nameFor(war.playerB)
  }));
  const territoryMomentum = input.dashboard.territoryMomentum.map((entry) => ({
    ...entry,
    playerName: nameFor(entry.playerId)
  }));
  const biggestSwing24h =
    input.dashboard.biggestSwing24h === null
      ? null
      : { ...input.dashboard.biggestSwing24h, playerName: nameFor(input.dashboard.biggestSwing24h.playerId) };
  const frontlineHotspots = input.dashboard.frontlineHotspots.map((hotspot) => ({
    ...hotspot,
    contestedByNames: hotspot.contestedBy.map(nameFor)
  }));
  const biggestBattle24h =
    input.dashboard.biggestBattle24h === null
      ? null
      : {
          ...input.dashboard.biggestBattle24h,
          attackerName: nameFor(input.dashboard.biggestBattle24h.attackerId),
          defenderName: input.dashboard.biggestBattle24h.defenderId ? nameFor(input.dashboard.biggestBattle24h.defenderId) : undefined
        };
  const fiercestAttacker24h =
    input.dashboard.fiercestAttacker24h === null
      ? null
      : { ...input.dashboard.fiercestAttacker24h, attackerName: nameFor(input.dashboard.fiercestAttacker24h.attackerId) };
  const toughestTarget24h =
    input.dashboard.toughestTarget24h === null
      ? null
      : { ...input.dashboard.toughestTarget24h, defenderName: nameFor(input.dashboard.toughestTarget24h.defenderId) };
  const growth = await computePlayerGrowth(input.growthBaselineStore, input.powerScore, nameFor, now);

  return {
    generatedAt: new Date(input.dashboard.generatedAt).toISOString(),
    alliances,
    allianceBreaks,
    truceWatch: truceWatchView(input.socialSnapshot),
    fortification,
    wars,
    territoryMomentum,
    biggestSwing24h,
    frontlineHotspots,
    manpowerLost24h: input.dashboard.manpowerLost24h,
    biggestBattle24h,
    fiercestAttacker24h,
    toughestTarget24h,
    growth,
    powerScore: input.powerScore,
    dailyStory: buildDailyStory(
      {
        wars,
        territoryMomentum,
        biggestSwing24h,
        frontlineHotspots,
        alliances,
        allianceBreaks,
        powerScore: input.powerScore,
        biggestBattle24h,
        fiercestAttacker24h,
        toughestTarget24h,
        growth
      },
      nameFor
    )
  };
};
