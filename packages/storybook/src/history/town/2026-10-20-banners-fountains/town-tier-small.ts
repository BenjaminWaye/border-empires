// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-small.ts at commit fc4288dd (2026-10-20).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// SETTLEMENT, TOWN and CITY layouts: clockwork skyscrapers on an octagonal
// plate. A town grows outward and upward: a handful of low towers round a cog
// lamp, then a street grid of blocks (town-street-grid.ts) rising to a few
// glass towers, then a denser grid with a skybridged glass downtown -- each
// flying its owner's banners from the plate's corners.
import { flowerBed, plateBanners } from "./town-flourishes.js";
import { lampPost, octagonPlate, polar, tree, type TownBuilders } from "./town-parts.js";
import { buildStreetGrid, type StreetGridSpec } from "./town-street-grid.js";
import { cogLamp, towerRing } from "./town-skyscraper.js";

export const buildSettlement = (t: TownBuilders): void => {
  octagonPlate(t, 0.32);
  towerRing(t, { count: 4, radius: 0.19, startDeg: 45, w: 0.085, h: [0.09, 0.13], crowns: ["dome", "flat", "dome", "flat"] });
  cogLamp(t, 0, 0, 0.035);
  flowerBed(t, 0, 0, 0.072, 6, 0.011);
  plateBanners(t, 0.32, 0.09);
  for (const degrees of [90, 270]) {
    const [x, z] = polar(0.2, degrees);
    tree(t, x, z, 0.09);
  }
  lampPost(t, 0.1, 0.0);
  lampPost(t, -0.1, 0.0);
};

export const TOWN_GRID: StreetGridSpec = {
  plateRadius: 0.4, cells: 4, cell: 0.13, street: 0.035, focus: [0.08, -0.08],
  minH: 0.08, maxH: 0.34, allGlassShare: 0.45, splitShare: 0.45, parks: [[1, 2]], bridgeShare: 0.6
};

export const CITY_GRID: StreetGridSpec = {
  plateRadius: 0.44, cells: 5, cell: 0.11, street: 0.03, focus: [0.14, -0.14],
  minH: 0.1, maxH: 0.56, allGlassShare: 0.6, splitShare: 0.4, parks: [[2, 2], [1, 3]], bridgeShare: 0.55
};

/** A street grid of blocks round a small park with the orrery, rising to a
 * cluster of towers. */
export const buildTown = (t: TownBuilders): void => {
  buildStreetGrid(t, TOWN_GRID);
  plateBanners(t, TOWN_GRID.plateRadius, 0.1);
};

/** A denser grid rising to a glass downtown of skybridged towers, with a
 * central park round the orrery and a second park with a pool. */
export const buildCity = (t: TownBuilders): void => {
  buildStreetGrid(t, CITY_GRID);
  plateBanners(t, CITY_GRID.plateRadius, 0.11);
};
