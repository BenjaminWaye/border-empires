// Judges a player's achievements when their PLAYER_UPDATE is built: records
// newly earned badges on the player (with a Chronicle entry) and returns the
// wire view. Cheap: counters are O(1) and town tiers are one entry per town.
import { TOWN_TIER_RANK, achievementById, evaluateAchievements, type AchievementStats, type AchievementsView } from "@border-empires/shared";
import { appendPlayerEventLogEntry, type PlayerAchievementState, type PlayerEventLogEntry } from "@border-empires/game-domain";

type AchievementPlayer = { achievements?: PlayerAchievementState; eventLog?: PlayerEventLogEntry[] };

export const bestTownTierRank = (tiers: Iterable<string>): number => {
  let best = 0;
  for (const tier of tiers) best = Math.max(best, TOWN_TIER_RANK[tier as keyof typeof TOWN_TIER_RANK] ?? 0);
  return best;
};

export const achievementStatsFor = (
  player: AchievementPlayer,
  input: { townTiers: Iterable<string>; tilesExplored: number; ownedTiles: number; integrityPct: number }
): AchievementStats => ({
  bestTownTierRank: bestTownTierRank(input.townTiers),
  campsCleared: player.achievements?.campsCleared ?? 0,
  tilesTakenInBattle: player.achievements?.tilesTakenInBattle ?? 0,
  structuresBuilt: player.achievements?.structuresBuilt ?? 0,
  tilesExplored: input.tilesExplored,
  ownedTiles: input.ownedTiles,
  integrityPct: input.integrityPct
});

/** Evaluate, record new badges on `player` (earned time + Chronicle line), and return the view. */
export const updateAchievements = (player: AchievementPlayer, stats: AchievementStats, now: number): AchievementsView => {
  const { progress, newlyEarned } = evaluateAchievements(stats, player.achievements?.earned);
  if (newlyEarned.length > 0) {
    const state = player.achievements ?? {};
    const earned = { ...(state.earned ?? {}) };
    for (const id of newlyEarned) {
      earned[id] = now;
      appendPlayerEventLogEntry(player, { type: "ACHIEVEMENT_EARNED", text: `Achievement earned: ${achievementById(id).name}`, occurredAt: now });
    }
    player.achievements = { ...state, earned };
  }
  return { progress, earned: { ...(player.achievements?.earned ?? {}) } };
};
