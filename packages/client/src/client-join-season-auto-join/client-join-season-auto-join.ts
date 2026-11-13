import type { ClientState } from "../client-state/client-state.js";

// Every player who opens the game while a Sector Contest is running is sent
// straight in: opening the game means playing, not clicking through a "join"
// screen first. (A pending contest still shows its countdown lobby, which
// joins on its own once the gates open.) A full Sector is handled by the
// SEASON_FULL rejection, which opens the next-Sector waitlist.
//
// Recording the attempt here, and refusing another for a while, is what stops
// a join that comes back without spawning (no free spot) from re-firing on
// every render.
const AUTO_JOIN_RETRY_MS = 15_000;
let lastAutoJoinAttemptAt = 0;

type AutoJoinState = Pick<ClientState, "needsSeasonJoin" | "seasonPending" | "joinSeasonPending" | "profileSetupRequired">;

export const takeAutoJoinTurn = (state: AutoJoinState, now: number): boolean => {
  if (!state.needsSeasonJoin || state.seasonPending || state.joinSeasonPending || state.profileSetupRequired) return false;
  if (now - lastAutoJoinAttemptAt < AUTO_JOIN_RETRY_MS) return false;
  lastAutoJoinAttemptAt = now;
  return true;
};

export const resetAutoJoinForTests = (): void => {
  lastAutoJoinAttemptAt = 0;
};
