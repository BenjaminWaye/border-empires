import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

// GDD §6, "No landing site, no join": a player turned away because the map
// has no viable landing site keeps a place in the next contest. The place is
// an entry on the next-Sector waitlist, keyed by the current season like a
// SEASON_FULL waitlist entry, so the client's waitlist button shows it as
// already joined. Resolves false when the season or store is unavailable;
// the player is still told joining is closed.
export type ReserveNextContestPlaceDeps = {
  store: SectorWaitlistStore;
  getCurrentSeason: () => Promise<{ seasonId: string }>;
  now?: () => number;
};

export const reserveNextContestPlace = async (deps: ReserveNextContestPlaceDeps, playerId: string): Promise<boolean> => {
  try {
    const { seasonId } = await deps.getCurrentSeason();
    await deps.store.join({ seasonId, playerId, joinedAt: (deps.now ?? Date.now)() });
    return true;
  } catch {
    return false;
  }
};
