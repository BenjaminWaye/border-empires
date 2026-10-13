// Extra rows/flags layered onto a single-tile menu view right before it
// renders. Extracted from client-tile-action-menu-ui.ts (500-line cap) --
// renderHud re-renders the open menu on every server tick with a fresh,
// non-injected view, so every injector has to run on each render.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { injectWaypointActions, type WaypointMenuDeps } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import { injectDebugDownloadRow } from "../client-tile-menu-debug-row/client-tile-menu-debug-row.js";
import { injectDockNavigatorRow } from "../client-dock-navigator/client-dock-navigator.js";
import { injectOnboardingRelayBeaconRecommendation } from "../client-onboarding-checklist/client-onboarding-relay-beacon-recommendation.js";

export const injectTileMenuExtras = (view: TileMenuView, tile: Tile, state: ClientState, deps: WaypointMenuDeps): void => {
  injectWaypointActions(view, tile, state, deps);
  injectDebugDownloadRow(view, tile, state.authEmail);
  injectDockNavigatorRow(view, tile, state);
  injectOnboardingRelayBeaconRecommendation(view, tile);
};
