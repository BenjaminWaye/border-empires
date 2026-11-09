import type { ClientState } from "../client-state/client-state.js";

// Join outcomes the gateway reports as ERROR codes. SEASON_ENDED means the
// world has a winner and nobody can join until a new season starts, so the
// join prompt is closed (the season-end screen takes over instead). Returns
// true when the code was a join outcome so the caller can stop processing.
export const applyJoinSeasonErrorCode = (
  state: Pick<ClientState, "joinSeasonPending" | "needsSeasonJoin" | "joinSeasonOverlayOpen">,
  code: string
): boolean => {
  if (code === "SEASON_ENDED") {
    state.joinSeasonPending = false;
    state.needsSeasonJoin = false;
    state.joinSeasonOverlayOpen = false;
    return true;
  }
  if (code === "JOIN_SEASON_FAILED") {
    state.joinSeasonPending = false;
    return true;
  }
  return false;
};
