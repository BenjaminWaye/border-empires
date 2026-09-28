import type { ActivityApiResponse, LeaderboardOverallEntry, WorldPulse } from "@border-empires/game-domain";

import { buildPlayerNameResolver, isBarbarianPlayerId } from "./activity-api-player-names.js";
import { buildDailyStory } from "./daily-story.js";

const WORLD_PULSE_LEADING_POWER_CAP = 5;
const WORLD_PULSE_STORY_CAP = 5;

const includesBarbarian = (playerIds: readonly (string | undefined)[]): boolean =>
  playerIds.some((playerId) => isBarbarianPlayerId(playerId));

const eligiblePowerScore = (powerScore: readonly LeaderboardOverallEntry[]): LeaderboardOverallEntry[] =>
  powerScore
    .filter((entry) => !isBarbarianPlayerId(entry.id))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

export type BuildWorldPulseInput = {
  activity: ActivityApiResponse;
  playerId: string;
  seasonId: string;
  previousRank?: number;
  previousRankSeasonId?: string;
  seasonLabel?: string;
};

// Builds a player-safe dashboard digest from the same gateway-assembled
// activity snapshot as GET /api/activity. Barbarian-bearing source rows are
// removed before narration/significance selection—not merely hidden after a
// story is already chosen—so they cannot distort the player-facing ranking.
export const buildWorldPulse = (input: BuildWorldPulseInput): WorldPulse => {
  const powers = eligiblePowerScore(input.activity.powerScore);
  const nameFor = buildPlayerNameResolver(powers);
  const wars = input.activity.wars.filter((entry) => !includesBarbarian([entry.playerA, entry.playerB]));
  const territoryMomentum = input.activity.territoryMomentum.filter((entry) => !isBarbarianPlayerId(entry.playerId));
  const biggestSwing24h = input.activity.biggestSwing24h && !isBarbarianPlayerId(input.activity.biggestSwing24h.playerId)
    ? input.activity.biggestSwing24h
    : null;
  const frontlineHotspots = input.activity.frontlineHotspots.filter((entry) => !includesBarbarian(entry.contestedBy));
  const biggestBattle24h = input.activity.biggestBattle24h && !includesBarbarian([input.activity.biggestBattle24h.attackerId, input.activity.biggestBattle24h.defenderId])
    ? input.activity.biggestBattle24h
    : null;
  const fiercestAttacker24h = input.activity.fiercestAttacker24h && !isBarbarianPlayerId(input.activity.fiercestAttacker24h.attackerId)
    ? input.activity.fiercestAttacker24h
    : null;
  const toughestTarget24h = input.activity.toughestTarget24h && !isBarbarianPlayerId(input.activity.toughestTarget24h.defenderId)
    ? input.activity.toughestTarget24h
    : null;
  const alliances = input.activity.alliances.filter((entry) => !includesBarbarian([entry.playerA, entry.playerB]));
  const allianceBreaks = input.activity.allianceBreaks.filter((entry) => !includesBarbarian([entry.playerA, entry.playerB, entry.brokenBy]));
  const growth = input.activity.growth.filter((entry) => !isBarbarianPlayerId(entry.playerId));
  const rank = powers.find((entry) => entry.id === input.playerId)?.rank;
  const rankChange =
    typeof rank === "number" &&
    input.previousRankSeasonId === input.seasonId &&
    typeof input.previousRank === "number"
      ? input.previousRank - rank
      : undefined;
  const stories = buildDailyStory(
    {
      wars,
      territoryMomentum,
      biggestSwing24h,
      frontlineHotspots,
      alliances,
      allianceBreaks,
      powerScore: powers,
      biggestBattle24h,
      fiercestAttacker24h,
      toughestTarget24h,
      growth
    },
    nameFor
  )
    .filter((story) => !story.participantIds.includes(input.playerId))
    .slice(0, WORLD_PULSE_STORY_CAP)
    .map((story) => ({
      type: story.type,
      headline: story.headline,
      text: story.dashboardText,
      participantIds: [...story.participantIds]
    }));

  return {
    generatedAt: input.activity.generatedAt,
    seasonId: input.seasonId,
    ...(input.seasonLabel ? { seasonLabel: input.seasonLabel } : {}),
    ...(typeof rank === "number" ? { rank } : {}),
    ...(typeof rankChange === "number" && rankChange !== 0 ? { rankChange } : {}),
    leadingPowers: powers.slice(0, WORLD_PULSE_LEADING_POWER_CAP).map(({ id, name, score, rank: powerRank }) => ({
      playerId: id,
      name,
      score,
      rank: powerRank
    })),
    stories
  };
};
