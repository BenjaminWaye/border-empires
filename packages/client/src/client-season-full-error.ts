import type { ClientState } from "./client-state/client-state.js";

// Applies the SEASON_FULL login rejection to state. Terminal for this login
// attempt: unlike SERVER_BUSY/SERVER_STARTING there is nothing to retry — the
// season is at capacity, not temporarily overloaded — so this leaves the auth
// overlay up with a static message and the next-Sector waitlist button (see
// client-sector-waitlist.ts) instead of scheduling a reconnect.
export const applySeasonFullError = (
  state: Pick<ClientState, "authSessionReady" | "authRetrying" | "joinSeasonOverlayOpen" | "seasonFull" | "authBusy" | "authBusyStartedAt" | "authBusyTitle" | "authBusyDetail">,
  errorMessage: string
): void => {
  state.authSessionReady = false;
  state.authRetrying = false;
  state.seasonFull = true;
  // The join card is fullscreen and hides #auth-overlay with the rest of the
  // HUD, so it must close or the waitlist below is unreachable.
  state.joinSeasonOverlayOpen = false;
  state.authBusy = true;
  state.authBusyStartedAt = state.authBusyStartedAt || Date.now();
  state.authBusyTitle = "This Sector Contest is full";
  state.authBusyDetail = errorMessage || "Every House slot in this Sector is taken.";
};
