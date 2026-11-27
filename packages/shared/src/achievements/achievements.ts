// Achievements: hard, personal badges a House earns once per contest. They are
// deliberately not rankings, so they never repeat the victory paths, the season
// records (Longest Road, Most Deadly Tile), the awards or House Charges.
// Thresholds are plain constants here so balance can be tuned in one place.

export type AchievementId = "METROPOLIS" | "PACIFIER" | "WARLORD" | "CARTOGRAPHER" | "MASTER_BUILDER" | "IRON_WALL";

/** What the simulation counts or reads to judge progress. */
export type AchievementStats = {
  /** Highest town tier the House holds right now, as a rank (SETTLEMENT = 0 ... METROPOLIS = 4). */
  bestTownTierRank: number;
  campsCleared: number;
  tilesTakenInBattle: number;
  tilesExplored: number;
  structuresBuilt: number;
  ownedTiles: number;
  integrityPct: number;
};

export type AchievementDefinition = {
  id: AchievementId;
  name: string;
  /** Short goal line shown on the badge. */
  goal: string;
  target: number;
  progress: (stats: AchievementStats) => number;
};

export const TOWN_TIER_RANK = { SETTLEMENT: 0, TOWN: 1, CITY: 2, GREAT_CITY: 3, METROPOLIS: 4 } as const;
export const IRON_WALL_MIN_TILES = 1_000;

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: "METROPOLIS", name: "Metropolis", goal: "Grow a town to Metropolis", target: TOWN_TIER_RANK.METROPOLIS, progress: (s) => s.bestTownTierRank },
  { id: "PACIFIER", name: "Pacifier", goal: "Clear 50 Insurgent camps", target: 50, progress: (s) => s.campsCleared },
  { id: "WARLORD", name: "Warlord", goal: "Take 500 tiles from rival Houses in battle", target: 500, progress: (s) => s.tilesTakenInBattle },
  { id: "CARTOGRAPHER", name: "Cartographer", goal: "Explore 30,000 tiles", target: 30_000, progress: (s) => s.tilesExplored },
  { id: "MASTER_BUILDER", name: "Master Builder", goal: "Finish 100 structures", target: 100, progress: (s) => s.structuresBuilt },
  // Progress is the Integrity percentage, counted only once the realm is big enough.
  { id: "IRON_WALL", name: "Iron Wall", goal: "Reach 100% Integrity with 1,000 tiles", target: 100, progress: (s) => (s.ownedTiles >= IRON_WALL_MIN_TILES ? s.integrityPct : 0) }
];

export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENTS.map((a) => a.id);

export const isAchievementId = (value: unknown): value is AchievementId =>
  typeof value === "string" && (ACHIEVEMENT_IDS as readonly string[]).includes(value);

export const achievementById = (id: AchievementId): AchievementDefinition => ACHIEVEMENTS.find((a) => a.id === id)!;

/** Wire shape: current progress per achievement (capped at target) and when each was earned. */
export type AchievementsView = {
  progress: Partial<Record<AchievementId, number>>;
  earned: Partial<Record<AchievementId, number>>;
};

/**
 * Progress for every achievement, and the ids newly earned (not in `earned` yet,
 * progress at target). Pure: the caller records the new ids.
 */
export const evaluateAchievements = (
  stats: AchievementStats,
  earned: Partial<Record<AchievementId, number>> | undefined
): { progress: Partial<Record<AchievementId, number>>; newlyEarned: AchievementId[] } => {
  const progress: Partial<Record<AchievementId, number>> = {};
  const newlyEarned: AchievementId[] = [];
  for (const achievement of ACHIEVEMENTS) {
    const value = Math.max(0, Math.min(achievement.target, Math.floor(achievement.progress(stats))));
    progress[achievement.id] = value;
    if (value >= achievement.target && earned?.[achievement.id] === undefined) newlyEarned.push(achievement.id);
  }
  return { progress, newlyEarned };
};
