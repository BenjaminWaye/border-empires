import type { ClientState } from "../client-state/client-state.js";
import { isSeasonLobbyFullscreenActive } from "../client-season-lobby-fullscreen.js";

export type MapUnobstructedState = Pick<
  ClientState,
  | "authSessionReady"
  | "profileSetupRequired"
  | "changelog"
  | "needsSeasonJoin"
  | "joinSeasonOverlayOpen"
  | "respawnOverlayOpen"
  | "seasonWinner"
  | "seasonEndDismissed"
> & { activityDashboard: { open: boolean } };

/**
 * True when no auto-opening dialog covers the map, i.e. the player's eyes can
 * be on it: signed in, name/colour setup done, and none of the changelog,
 * Activity dashboard, join-season lobby, respawn notice or
 * season-end overlays is open. Corner UI (discovery-tip toast, onboarding
 * bubble) deliberately does not count -- it never covers the map centre.
 */
export const isMapUnobstructed = (state: MapUnobstructedState): boolean =>
  state.authSessionReady &&
  !state.profileSetupRequired &&
  !state.changelog.open &&
  !state.activityDashboard.open &&
  !isSeasonLobbyFullscreenActive(state) &&
  !state.respawnOverlayOpen &&
  !(Boolean(state.seasonWinner) && !state.seasonEndDismissed);
