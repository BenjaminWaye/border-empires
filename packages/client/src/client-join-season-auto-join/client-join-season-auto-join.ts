import type { ClientState } from "../client-state/client-state.js";

// Every player who opens the game while a Sector Contest is running is sent
// straight in: opening the game means playing, not clicking through a "join"
// screen first. (A pending contest still shows its countdown lobby, which
// joins on its own once the gates open.) A full Sector is handled by the
// SEASON_FULL rejection, which opens the next-Sector waitlist.
//
// One automatic attempt per contest per page load. A join that fails, stalls
// past the watchdog or comes back without a spawn leaves the Play button,
// rather than re-sending JOIN_SEASON on every render -- a stalled simulation
// must not be hit by every waiting client again and again. Keyed by season
// id, so a rollover to a new contest gets a fresh attempt.
const autoJoinedSeasonIds = new Set<string>();

type AutoJoinState = Pick<ClientState, "needsSeasonJoin" | "seasonPending" | "joinSeasonPending" | "profileSetupRequired" | "joinSeasonId">;

export const canAutoJoin = (state: AutoJoinState): boolean =>
  state.needsSeasonJoin &&
  !state.seasonPending &&
  !state.joinSeasonPending &&
  !state.profileSetupRequired &&
  !autoJoinedSeasonIds.has(state.joinSeasonId);

// Call once the JOIN_SEASON message was actually sent; a send that could not
// go out (session not ready) leaves the attempt available.
export const recordAutoJoin = (state: Pick<ClientState, "joinSeasonId">): void => {
  // Bounded: one entry per contest seen in this page load.
  if (autoJoinedSeasonIds.size >= 16) autoJoinedSeasonIds.clear();
  autoJoinedSeasonIds.add(state.joinSeasonId);
};

export const resetAutoJoinForTests = (): void => {
  autoJoinedSeasonIds.clear();
};
