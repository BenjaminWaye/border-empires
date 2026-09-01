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

// The costliest single ATTACK resolution in the trailing 24h window, by
// manpower lost (see apps/simulation/src/combat-manpower-log/). defenderId
// is undefined for an attack on unowned/neutral land.
export type BiggestBattle24h = {
  attackerId: string;
  defenderId: string | undefined;
  attackerWon: boolean;
  manpowerLoss: number;
  x: number;
  y: number;
  at: number;
} | null;

/** Sim-computed half of the response — produced by GetActivityDashboard RPC (simulation.proto). */
export type ActivityDashboardSnapshot = {
  generatedAt: number;
  fortification: FortificationRankingEntry[];
  wars: WarSummary[];
  territoryMomentum: TerritoryMomentumEntry[];
  biggestSwing24h: BiggestSwing24h;
  frontlineHotspots: FrontlineHotspot[];
  manpowerLost24h: number;
  biggestBattle24h: BiggestBattle24h;
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
export type BiggestBattle24hView =
  | (Omit<NonNullable<BiggestBattle24h>, "defenderId"> & {
      attackerName: string;
      defenderId: string | undefined;
      defenderName: string | undefined;
    })
  | null;

// Day-over-day growth for one player, diffed against a stored baseline (see
// apps/realtime-gateway/src/player-growth-baseline-store/) taken roughly 24h
// ago. Absent entirely for a player with no baseline yet (first time seen,
// or the sim/gateway restarted since) -- there's deliberately no "0 growth"
// entry for that case, since it isn't actually known.
export type PlayerGrowthDelta = {
  playerId: string;
  playerName: string;
  incomePerMinute: number;
  incomePerMinuteDelta: number;
  manpowerCap: number;
  manpowerCapDelta: number;
  baselineAt: number;
};

// A single narrated headline for the day's highlights digest
// (buildDailyStory, apps/realtime-gateway/src/activity-api/daily-story.ts).
// Written in the game's own in-fiction voice — the same terse,
// present-passive "X was conquered from Y" register used by
// packages/client/src/client-alerts/client-alerts.ts and
// runtime-ownership-change-sample.ts — not a stats-dashboard sentence.
// `significance` ranks events within a day so the caller can take a top-N
// slice; it has no meaning across days.
export type DailyStoryEventType =
  | "BIGGEST_DEFEAT"
  | "OPEN_WAR"
  | "FIERCEST_FIGHTING"
  | "BLOODIEST_BATTLE"
  | "ALLIANCE_FORMED"
  | "ALLIANCE_BROKEN"
  | "FASTEST_EXPANSION"
  | "ECONOMY_BOOM"
  | "MANPOWER_SURGE"
  | "STRONGEST_EMPIRE";

export type DailyStoryEvent = {
  type: DailyStoryEventType;
  headline: string;
  text: string;
  significance: number;
  players: string[];
  x?: number;
  y?: number;
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
  manpowerLost24h: number;
  biggestBattle24h: BiggestBattle24hView;
  growth: PlayerGrowthDelta[];
  powerScore: LeaderboardOverallEntry[];
  dailyStory: DailyStoryEvent[];
};
