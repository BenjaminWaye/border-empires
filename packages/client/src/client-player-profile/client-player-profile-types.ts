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

// Mirrors GalaxyPublicPlanetView/GalaxyOutpostView from the gateway's
// galaxy-routes.ts (GET /hq/galaxy/by-player/:playerId) -- only the fields
// the profile card actually renders.
export type GalaxyHoldingsPlanetView = {
  seasonSequence: number;
  objectiveName: string;
  specialization: string;
  planetName: string | null;
};

export type GalaxyHoldingsOutpostView = {
  seasonSequence: number;
  specialization: string;
};

// Career trophy case: how many times this account has won each victory
// condition, historically (survives Defense Campaign ownership transfers,
// unlike the `planets` list above which shows current ownership only).
export type GalaxyTrophyView = {
  objectiveId: string;
  objectiveName: string;
  count: number;
};

export type GalaxyHoldingsView = {
  planets: GalaxyHoldingsPlanetView[];
  outposts: GalaxyHoldingsOutpostView[];
  trophyCase?: GalaxyTrophyView[];
};
