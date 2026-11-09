// Multiplayer ELO from a season's final standings. A season is treated as a
// round-robin of pairwise results: each player "beat" everyone ranked below
// them, "lost" to everyone ranked above, and drew with anyone sharing their
// rank. Actual and expected scores are averaged over the N-1 opponents, so a
// single season moves a rating by at most K regardless of how many players
// took part (a 40-player season would otherwise swing ratings 39x harder
// than a 2-player one).

export const ELO_INITIAL_RATING = 1200;
export const ELO_K_FACTOR = 32;

export type SeasonStanding = { playerId: string; rank: number };

export type SeasonEloResult = { ratingBefore: number; ratingAfter: number };

const expectedScore = (rating: number, opponentRating: number): number =>
  1 / (1 + 10 ** ((opponentRating - rating) / 400));

const pairwiseResult = (rank: number, opponentRank: number): number => {
  if (rank < opponentRank) return 1;
  if (rank > opponentRank) return 0;
  return 0.5;
};

/**
 * `priorRatingFor` returns the player's rating going into this season, or
 * undefined for a player with no rated history (they start at
 * ELO_INITIAL_RATING). Ratings are rounded to whole points after each season.
 */
export const computeSeasonElo = (
  standings: readonly SeasonStanding[],
  priorRatingFor: (playerId: string) => number | undefined
): Map<string, SeasonEloResult> => {
  const results = new Map<string, SeasonEloResult>();
  const unique = new Map<string, SeasonStanding>();
  for (const standing of standings) {
    if (!unique.has(standing.playerId)) unique.set(standing.playerId, standing);
  }
  const players = [...unique.values()].map((standing) => ({
    ...standing,
    rating: priorRatingFor(standing.playerId) ?? ELO_INITIAL_RATING
  }));
  const opponents = players.length - 1;
  for (const player of players) {
    if (opponents <= 0) {
      results.set(player.playerId, { ratingBefore: player.rating, ratingAfter: player.rating });
      continue;
    }
    let actual = 0;
    let expected = 0;
    for (const opponent of players) {
      if (opponent === player) continue;
      actual += pairwiseResult(player.rank, opponent.rank);
      expected += expectedScore(player.rating, opponent.rating);
    }
    const delta = (ELO_K_FACTOR * (actual - expected)) / opponents;
    results.set(player.playerId, { ratingBefore: player.rating, ratingAfter: Math.round(player.rating + delta) });
  }
  return results;
};
