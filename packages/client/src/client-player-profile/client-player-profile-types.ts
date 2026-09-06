// Season-scoped record of a truce a player broke -- see gateway's
// truceBreaksByPlayerId (social-state.ts). Backs the profile "oathbreaker"
// badge/list; lasts the whole season, unlike the 24h new-truce lockout.
// Split out of client-types.ts, which is already over the repo's 500-line
// file-size gate and may not grow further.
export type TruceBreakView = {
  targetPlayerId: string;
  targetPlayerName: string;
  brokenAt: number;
};
