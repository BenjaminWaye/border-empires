import type { SimulationSeasonState } from "@border-empires/sim-protocol";

const DEFAULT_MAX_SEASON_GUESTS = 10;

// Guest allowance inside the overall season cap. Unlike
// SIMULATION_MAX_SEASON_PLAYERS, 0 does not mean "unlimited": it admits no
// new guests, which is the safe reading for a limit whose job is to stop
// throwaway accounts filling the season.
export const resolveMaxSeasonGuests = (configured?: number): number => {
  const value = Number(configured ?? process.env.SIMULATION_MAX_SEASON_GUESTS ?? DEFAULT_MAX_SEASON_GUESTS);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_MAX_SEASON_GUESTS;
};

export const isSeasonGuest = (seasonState: SimulationSeasonState, playerId: string): boolean =>
  seasonState.guestPlayerIds?.includes(playerId) ?? false;

export const withSeasonGuest = (seasonState: SimulationSeasonState, playerId: string): SimulationSeasonState => {
  const guestPlayerIds = seasonState.guestPlayerIds ?? [];
  if (guestPlayerIds.includes(playerId)) return seasonState;
  return { ...seasonState, guestPlayerIds: [...guestPlayerIds, playerId] };
};

export const withoutSeasonGuest = (seasonState: SimulationSeasonState, playerId: string): SimulationSeasonState => {
  if (!isSeasonGuest(seasonState, playerId)) return seasonState;
  return { ...seasonState, guestPlayerIds: (seasonState.guestPlayerIds ?? []).filter((id) => id !== playerId) };
};

// Only guests that still have a runtime record hold a slot; a recorded guest
// whose spawn never happened should not block the next one.
export const seasonGuestCount = (seasonState: SimulationSeasonState, hasPlayer: (playerId: string) => boolean): number =>
  (seasonState.guestPlayerIds ?? []).filter(hasPlayer).length;

// A returning guest (already has a runtime record) is never rejected, the
// same rule the overall cap follows.
export const guestAllowanceIsFull = (
  maxSeasonGuests: number,
  seasonState: SimulationSeasonState,
  runtime: { hasPlayer: (playerId: string) => boolean },
  playerId: string
): boolean => !runtime.hasPlayer(playerId) && seasonGuestCount(seasonState, (id) => runtime.hasPlayer(id)) >= maxSeasonGuests;
