// Ties the guide's Manufactory step to the tile menu: when the player opens one
// of the marked towns, its Build Manufactory action carries the "★ Recommended"
// badge, leads its tab and opens the Build list on that tab (client-hud-v2-build-list.ts).
// It is NOT copied into the tile's actions: the town screen drew every action in its bottom
// bar, so the guide's Manufactory showed there too. The guide teaches players to look in Build.
// Only set while the guide is on its build step, so this is beginner guidance,
// not a permanent hint on every Manufactory build. Same shape as
// client-onboarding-relay-beacon-recommendation.ts.

import type { Tile, TileMenuView } from "../client-types.js";

let recommendedTiles: ReadonlyArray<{ x: number; y: number }> = [];

/** Called each guide render with the marked tiles while the build step is showing; pass undefined to clear. */
export const setGuideManufactoryTargets = (tiles: ReadonlyArray<{ x: number; y: number }> | undefined): void => {
  recommendedTiles = tiles ?? [];
};

export const injectGuideManufactoryRecommendation = (view: TileMenuView, tile: Pick<Tile, "x" | "y">): void => {
  if (!recommendedTiles.some((t) => t.x === tile.x && t.y === tile.y)) return;
  for (const action of [...view.actions, ...view.buildings]) {
    if (action.id === "build_manufactory") action.recommended = true;
  }
};
