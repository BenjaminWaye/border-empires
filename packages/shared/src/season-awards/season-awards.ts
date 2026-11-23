// Sector Contest awards (docs/gdd.md §7, pillar 6: a contest you don't win
// still pays off). Decided once, at the crowning, from each House's redeploy
// count (DomainPlayer.redeploys) and its final placement. Bragging rights
// only: an award grants nothing inside a contest.
export const COMEBACK_KID_MAX_RANK = 5;

export type SeasonAward =
  /** The House that redeployed the most times in the contest. */
  | { kind: "NEVER_GAVE_UP"; playerId: string; playerName: string; redeploys: number }
  /** A House that redeployed and still finished in the top 5. */
  | { kind: "COMEBACK_KID"; playerId: string; playerName: string; redeploys: number; rank: number };

export const SEASON_AWARD_TITLE: Record<SeasonAward["kind"], string> = {
  NEVER_GAVE_UP: "Never Gave Up",
  COMEBACK_KID: "Comeback Kid"
};

export type SeasonAwardStanding = { readonly id: string; readonly name: string; readonly rank: number };

/**
 * `standings` is the final leaderboard, so only competing Houses (humans and
 * AI alike, never Planetary Defense) can be awarded. Never Gave Up goes to one
 * House: on equal redeploys the better placement wins, then the lower id.
 */
export const seasonAwardsAtCrowning = (
  standings: readonly SeasonAwardStanding[],
  redeploysByPlayerId: ReadonlyMap<string, number>
): SeasonAward[] => {
  const redeployed = standings
    .map((entry) => ({ ...entry, redeploys: Math.max(0, Math.floor(redeploysByPlayerId.get(entry.id) ?? 0)) }))
    .filter((entry) => entry.redeploys > 0);
  const awards: SeasonAward[] = [];
  const most = [...redeployed].sort((a, b) => b.redeploys - a.redeploys || a.rank - b.rank || a.id.localeCompare(b.id))[0];
  if (most) awards.push({ kind: "NEVER_GAVE_UP", playerId: most.id, playerName: most.name, redeploys: most.redeploys });
  for (const entry of [...redeployed].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    if (entry.rank <= COMEBACK_KID_MAX_RANK) awards.push({ kind: "COMEBACK_KID", playerId: entry.id, playerName: entry.name, redeploys: entry.redeploys, rank: entry.rank });
  }
  return awards;
};
