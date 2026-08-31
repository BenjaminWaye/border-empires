// Shared response types for the public GET /api/activity endpoint
// (apps/realtime-gateway/src/activity-api/) and the simulation-side snapshot
// it is assembled from (apps/simulation/src/activity-dashboard/). Kept in
// game-domain rather than server-shared-types.ts (already at its 500-line
// growth cap) so both apps/simulation (RPC producer) and
// apps/realtime-gateway (RPC consumer + response assembler) share one
// definition instead of two structurally-compatible-but-separate ones.
import type { LeaderboardOverallEntry } from "./server-shared-types.js";

export type FortificationRankingEntry = {
  playerId: string;
  score: number;
  forts: number;
  garrisonFillPct: number;
};

export type WarSummary = {
  playerA: string;
  playerB: string;
  tileFlips24h: number;
  lastFlipAt: number;
};

export type TerritoryMomentumEntry = {
  playerId: string;
  tilesGained24h: number;
  tilesLost24h: number;
  net24h: number;
};

export type BiggestSwing24h = {
  playerId: string;
  tilesLost: number;
  windowStart: number;
  windowEnd: number;
} | null;

export type FrontlineHotspot = {
  tileId: string;
  x: number;
  y: number;
  flips24h: number;
  contestedBy: string[];
};

/** Sim-computed half of the response — produced by GetActivityDashboard RPC (simulation.proto). */
export type ActivityDashboardSnapshot = {
  generatedAt: number;
  fortification: FortificationRankingEntry[];
  wars: WarSummary[];
  territoryMomentum: TerritoryMomentumEntry[];
  biggestSwing24h: BiggestSwing24h;
  frontlineHotspots: FrontlineHotspot[];
};

export type SocialAlliancePairView = { playerA: string; playerB: string; since: number };
export type SocialAllianceBreakView = { playerA: string; playerB: string; brokenBy: string; brokenAt: number; noticeEndsAt: number };
export type SocialTruceWatchView = { playerA: string; playerB: string; endsAt: number };

// API-level views: same shape as the sim-computed types above, but with a
// human-readable `*Name` field alongside every raw player id, resolved by
// buildActivityApiResponse (activity-api-response.ts) from the leaderboard
// (powerScore) plus a small fallback for ids that never appear there (e.g.
// "barbarian-1"). Kept separate from the RPC-level types so the sim<->gateway
// wire contract doesn't have to carry display names.
export type FortificationRankingEntryView = FortificationRankingEntry & { playerName: string };
export type WarSummaryView = WarSummary & { playerAName: string; playerBName: string };
export type TerritoryMomentumEntryView = TerritoryMomentumEntry & { playerName: string };
export type BiggestSwing24hView = (BiggestSwing24h & { playerName: string }) | null;
export type FrontlineHotspotView = Omit<FrontlineHotspot, "contestedBy"> & {
  contestedBy: string[];
  contestedByNames: string[];
};

/** Full GET /api/activity response — gateway-assembled from ActivityDashboardSnapshot + social views + the existing leaderboard. */
export type ActivityApiResponse = {
  generatedAt: string;
  alliances: SocialAlliancePairView[];
  allianceBreaks: SocialAllianceBreakView[];
  truceWatch: SocialTruceWatchView[];
  fortification: FortificationRankingEntryView[];
  wars: WarSummaryView[];
  territoryMomentum: TerritoryMomentumEntryView[];
  biggestSwing24h: BiggestSwing24hView;
  frontlineHotspots: FrontlineHotspotView[];
  powerScore: LeaderboardOverallEntry[];
};
