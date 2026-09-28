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

// The simulation's system combatant is not a power eligible for World Pulse.
// Keep this identity rule next to the only other gateway fallback for it so
// callers never depend on the display name "Barbarians".
export const isBarbarianPlayerId = (playerId: string | undefined): boolean =>
  playerId === "barbarian-1" || playerId === "barbarian";

export const buildPlayerNameResolver = (powerScore: LeaderboardOverallEntry[]): PlayerNameResolver => {
  const byId = new Map(powerScore.map((entry) => [entry.id, entry.name]));
  return (playerId: string): string => {
    const known = byId.get(playerId);
    if (known !== undefined) return known;
    if (isBarbarianPlayerId(playerId)) return "Barbarians";
    return playerId;
  };
};
