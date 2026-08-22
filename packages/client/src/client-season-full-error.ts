import type { ClientState } from "./client-state/client-state.js";

// Applies the SEASON_FULL login rejection to state. Terminal for this login
// attempt: unlike SERVER_BUSY/SERVER_STARTING there is nothing to retry — the
// season is at capacity, not temporarily overloaded — so this leaves the auth
// overlay up with a static message and the "alert me" affordance (see
// client-auth-ui.ts) instead of scheduling a reconnect.
export const applySeasonFullError = (
  state: Pick<ClientState, "authSessionReady" | "authRetrying" | "seasonFull" | "authBusy" | "authBusyStartedAt" | "authBusyTitle" | "authBusyDetail">,
  errorMessage: string
): void => {
  state.authSessionReady = false;
  state.authRetrying = false;
  state.seasonFull = true;
  state.authBusy = true;
  state.authBusyStartedAt = state.authBusyStartedAt || Date.now();
  state.authBusyTitle = "This season is full";
  state.authBusyDetail = errorMessage || "All empire slots are taken for this season.";
};
