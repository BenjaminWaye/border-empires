// Ties the guide's Manufactory step to the tile menu: when the player opens one
// of the marked towns, its Build Manufactory action carries the "★ Recommended"
// badge (and is listed first -- see client-tile-menu-html.ts's recommendedFirst).
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
  // The Manufactory lives in Buildings but the menu opens on Actions when that
  // tab exists: surface it there too so the guide's step is the first thing seen.
  const manufactory = view.buildings.find((action) => action.id === "build_manufactory");
  if (manufactory && view.tabs.includes("actions") && !view.actions.some((action) => action.id === "build_manufactory")) {
    view.actions.push({ ...manufactory });
  }
};
