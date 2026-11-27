import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

// GDD §6, "No landing site, no join": a player turned away because the map
// has no viable landing site keeps a place in the next contest. Two rows:
// - the next-Sector waitlist entry, keyed by the current season like a
//   SEASON_FULL entry, so the client's waitlist button shows it as joined;
// - the reservation itself, keyed by the next contest's season id
//   (reservedPlaceKey), which lets the player past that contest's player cap
//   (owner decision 2026-11-27; JoinSeason's reserved_place).
// Season ids are `season-<sequence>` (createSeasonId in the simulation).
export type ReserveNextContestPlaceDeps = {
  store: SectorWaitlistStore;
  getCurrentSeason: () => Promise<{ seasonId: string; seasonSequence: number }>;
  now?: () => number;
};

/** Waitlist-store key holding reserved places in the contest `seasonId`. */
export const reservedPlaceKey = (seasonId: string): string => `${seasonId}:reserved-place`;

const nextSeasonId = (seasonSequence: number): string => `season-${seasonSequence + 1}`;

/** Resolves false when the season or store is unavailable; the player is still told joining is closed. */
export const reserveNextContestPlace = async (deps: ReserveNextContestPlaceDeps, playerId: string): Promise<boolean> => {
  try {
    const { seasonId, seasonSequence } = await deps.getCurrentSeason();
    const joinedAt = (deps.now ?? Date.now)();
    await deps.store.join({ seasonId, playerId, joinedAt });
    await deps.store.join({ seasonId: reservedPlaceKey(nextSeasonId(seasonSequence)), playerId, joinedAt });
    return true;
  } catch {
    return false;
  }
};

/** True when `playerId` reserved a place in the current contest. Any failure reads as no reservation. */
export const hasReservedPlace = async (deps: Omit<ReserveNextContestPlaceDeps, "now">, playerId: string): Promise<boolean> => {
  try {
    const { seasonId } = await deps.getCurrentSeason();
    return await deps.store.has(reservedPlaceKey(seasonId), playerId);
  } catch {
    return false;
  }
};
