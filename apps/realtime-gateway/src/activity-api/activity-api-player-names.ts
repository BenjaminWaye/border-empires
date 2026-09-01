// Resolves a raw player id (from the sim-computed activity dashboard) to the
// display name shown on GET /api/activity. Primary source is the existing
// leaderboard (powerScore), which already carries a real chosen/seed name
// for every human and AI player. "barbarian-1" never appears on the
// leaderboard, so it gets a small hardcoded fallback matching the equivalent
// fallbacks in apps/realtime-gateway/src/auth-identity/auth-identity.ts and
// apps/simulation/src/world-status-snapshot/world-status-snapshot.ts. Any
// other unresolvable id (e.g. a player who has since been pruned) falls back
// to the raw id so the API never silently drops a field.
import type { LeaderboardOverallEntry } from "@border-empires/game-domain";

export type PlayerNameResolver = (playerId: string) => string;

export const buildPlayerNameResolver = (powerScore: LeaderboardOverallEntry[]): PlayerNameResolver => {
  const byId = new Map(powerScore.map((entry) => [entry.id, entry.name]));
  return (playerId: string): string => {
    const known = byId.get(playerId);
    if (known !== undefined) return known;
    if (playerId === "barbarian-1") return "Barbarians";
    return playerId;
  };
};
