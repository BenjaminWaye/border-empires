import type { ClientState } from "../client-state/client-state.js";
import { isSeasonLobbyFullscreenActive } from "../client-season-lobby-fullscreen.js";

export type MapUnobstructedState = Pick<
  ClientState,
  | "authSessionReady"
  | "mapPrep"
  | "authError"
  | "profileSetupRequired"
  | "changelog"
  | "needsSeasonJoin"
  | "joinSeasonOverlayOpen"
  | "respawnOverlayOpen"
  | "seasonWinner"
  | "seasonEndDismissed"
> & { lastContestRecap?: { open: boolean }; afcRecoveryPopupOpen?: boolean; activityDashboard: { open: boolean; chronicleOpen?: boolean } };

/**
 * True when no auto-opening dialog covers the map, i.e. the player's eyes can
 * be on it: signed in, name/colour setup done, the 3D map built (the
 * full-screen "Drawing your map..." overlay stays up through the staged build
 * after sign-in -- client-map-prep.ts, client-auth-ui.ts), and none of the changelog,
 * Activity dashboard (or the new HUD's Chronicle), join-season lobby, respawn notice or
 * season-end overlays is open. Corner UI (discovery-tip toast, onboarding
 * bubble) deliberately does not count -- it never covers the map centre.
 */
export const isMapUnobstructed = (state: MapUnobstructedState): boolean =>
  state.authSessionReady &&
  !state.profileSetupRequired &&
  !(state.mapPrep && !state.authError) &&
  !state.changelog.open &&
  !state.activityDashboard.open &&
  !state.activityDashboard.chronicleOpen &&
  !isSeasonLobbyFullscreenActive(state) &&
  !state.respawnOverlayOpen &&
  !state.afcRecoveryPopupOpen &&
  !(Boolean(state.seasonWinner) && !state.seasonEndDismissed) &&
  !state.lastContestRecap?.open;
