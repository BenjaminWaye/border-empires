// Leaderboard/season-summary/mission view types moved out of client-types.ts
// (file-line cap) -- re-exported there so existing importers of that path
// don't need to change. Same pattern as client-tile-menu-types.ts.
export type LeaderboardOverallEntry = { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; manpowerCap: number; score: number; rank: number };
export type LeaderboardMetricEntry = { id: string; name: string; value: number; rank: number };

export type SeasonStatsView = {
  mostDeadlyTile?: { x: number; y: number; manpowerLost: number };
  longestRoad?: { tileCount: number };
};

export type SeasonWinnerView = {
  playerId: string;
  playerName: string;
  crownedAt: number;
  objectiveId: "TOWN_CONTROL" | "ECONOMIC_HEGEMONY" | "RESOURCE_MONOPOLY" | "MARITIME_SUPREMACY" | "DIPLOMATIC_DOMINANCE";
  objectiveName: string;
  // Persisted with the winner so a client that connects after crowning
  // (fresh login, reconnect) still gets these via INIT, not just the one-off
  // GLOBAL_STATUS_UPDATE broadcast at the moment of crowning.
  seasonStats?: SeasonStatsView;
};

export type MissionState = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardLabel?: string;
  expiresAt?: number;
  completed: boolean;
  claimed: boolean;
};
