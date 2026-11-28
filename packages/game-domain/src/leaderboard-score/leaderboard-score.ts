import { GOLD_RESCALE_DIVISOR } from "../server-game-constants/server-game-constants.js";

// The leaderboard score (docs/game-mechanics.md), shared by the simulation,
// which ranks with it, and the client, which shows its parts on the profile.
//
//   score = garrisoned tiles + coin income per minute x 864 + Manifests x 8
//
// Only garrisoned (SETTLED) tiles count: captured frontier scores nothing
// until it is garrisoned. The income is after Empire Integrity, which a
// sprawling, thinly garrisoned frontier lowers -- so capturing tiles can drop
// the score a little until they are garrisoned (playtest 2026-11-27: 25 -> 24
// after 19 captures). By design, not a bug.
//
// §24.5: the income weight (3) is an old (pre-§6.1) gold/min figure, rescaled
// by the same GOLD_RESCALE_DIVISOR the real income source constants went
// through, so income keeps its intended share of the score.
export const LEADERBOARD_INCOME_WEIGHT = 3 * GOLD_RESCALE_DIVISOR;
export const LEADERBOARD_MANIFEST_WEIGHT = 8;

export type LeaderboardScoreParts = { tiles: number; coin: number; manifests: number };

export const leaderboardScoreParts = (settledTileCount: number, incomePerMinute: number, techCount: number): LeaderboardScoreParts => ({
  tiles: settledTileCount,
  coin: incomePerMinute * LEADERBOARD_INCOME_WEIGHT,
  manifests: techCount * LEADERBOARD_MANIFEST_WEIGHT
});

export const leaderboardScoreFor = (settledTileCount: number, incomePerMinute: number, techCount: number): number => {
  const parts = leaderboardScoreParts(settledTileCount, incomePerMinute, techCount);
  return Math.round((parts.tiles + parts.coin + parts.manifests) * 10) / 10;
};
