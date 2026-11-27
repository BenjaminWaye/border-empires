import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

// GDD §6, "No landing site, no join": a player turned away because the map
// has no viable landing site keeps a place in the next contest. Two rows:
// - the next-Sector waitlist entry, keyed by the current season like a
//   SEASON_FULL entry, so the client's waitlist button shows it as joined;
// - the reservation itself, keyed by the next contest's season sequence
//   (reservedPlaceKey), which lets the player past that contest's player cap
//   (owner decision 2026-11-27; JoinSeason's reserved_place).
// A hosted sector has no next contest and reserves nothing.
export type ReservedPlaceDeps = {
  store: SectorWaitlistStore;
  getCurrentSeason: () => Promise<{ seasonId: string; seasonSequence: number }>;
  now?: () => number;
};

/** Waitlist-store key holding reserved places in the contest with this season sequence. */
export const reservedPlaceKey = (seasonSequence: number): string => `reserved-place:seq-${seasonSequence}`;

// Both lookups are best-effort and bounded: a stalled store must not hold the JOIN_SEASON reply.
const RESERVED_PLACE_TIMEOUT_MS = 4_000;
const bounded = <T>(work: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([work.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), RESERVED_PLACE_TIMEOUT_MS).unref?.())]);

/** Resolves false when the season or store is unavailable; the player is still told joining is closed. */
export const reserveNextContestPlace = (deps: ReservedPlaceDeps, playerId: string): Promise<boolean> =>
  bounded((async () => {
    const { seasonId, seasonSequence } = await deps.getCurrentSeason();
    const joinedAt = (deps.now ?? Date.now)();
    await deps.store.join({ seasonId, playerId, joinedAt });
    await deps.store.join({ seasonId: reservedPlaceKey(seasonSequence + 1), playerId, joinedAt });
    return true;
  })(), false);

/** True when `playerId` reserved a place in the current contest. Any failure reads as no reservation. */
export const hasReservedPlace = (deps: Omit<ReservedPlaceDeps, "now">, playerId: string): Promise<boolean> =>
  bounded((async () => {
    const { seasonSequence } = await deps.getCurrentSeason();
    return deps.store.has(reservedPlaceKey(seasonSequence), playerId);
  })(), false);

/**
 * Joins normally; only a join refused as full is retried with the cap bypass,
 * and only for a player holding a reserved place, so an ordinary join pays
 * no extra round trip.
 */
export const joinWithReservedPlace = async <R extends { full?: boolean }>(
  join: (reservedPlace: boolean) => Promise<R>,
  playerHasReservedPlace: (() => Promise<boolean>) | undefined
): Promise<R> => {
  const first = await join(false);
  if (!first.full || !playerHasReservedPlace) return first;
  return (await playerHasReservedPlace()) ? join(true) : first;
};

/** The JOIN_SEASON handler's reservation hooks; none on a hosted sector. */
export const joinSeasonReservationDeps = (
  hostedSector: boolean,
  deps: Omit<ReservedPlaceDeps, "now">
): { reserveNextContestPlace?: (playerId: string) => Promise<boolean>; hasReservedPlace?: (playerId: string) => Promise<boolean> } =>
  hostedSector ? {} : { reserveNextContestPlace: (playerId) => reserveNextContestPlace(deps, playerId), hasReservedPlace: (playerId) => hasReservedPlace(deps, playerId) };
