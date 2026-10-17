// Ties the onboarding checklist's Relay Beacon marker to the tile menu: when
// the player opens the marked tile, its Build Relay Beacon action carries the
// "★ Recommended" badge (and is listed first -- see client-tile-menu-html.ts's
// recommendedFirst). Only set while the checklist is on its
// EXPAND_RELAY_BEACON step, so this is beginner guidance, not a permanent
// hint on every beacon build.

import type { Tile, TileMenuView } from "../client-types.js";

let recommendedSite: { x: number; y: number } | undefined;

/** Called with each checklist render's result; pass undefined to clear (step moved on, checklist hidden or done). */
export const setOnboardingRelayBeaconSite = (site: { x: number; y: number } | undefined): void => {
  recommendedSite = site;
};

export const onboardingRelayBeaconSite = (): { x: number; y: number } | undefined => recommendedSite;

export const injectOnboardingRelayBeaconRecommendation = (view: TileMenuView, tile: Pick<Tile, "x" | "y">): void => {
  if (!recommendedSite || recommendedSite.x !== tile.x || recommendedSite.y !== tile.y) return;
  // build_relay_beacon_frontier is the neutral-tile variant (expand + garrison + build), already on Actions.
  for (const action of [...view.actions, ...view.buildings]) {
    if (action.id === "build_relay_beacon" || action.id === "build_relay_beacon_frontier") action.recommended = true;
  }
  // A settled tile's beacon lives in Buildings, but the menu opens on Actions
  // when that tab exists -- surface it there too (same dual-tab treatment as
  // the frontier beacon and a ready Farmstead, client-tile-action-support.ts)
  // so the checklist's next step is the first thing the player sees.
  const beacon = view.buildings.find((action) => action.id === "build_relay_beacon");
  if (beacon && view.tabs.includes("actions") && !view.actions.some((action) => action.id === "build_relay_beacon")) {
    view.actions.push({ ...beacon });
  }
};
