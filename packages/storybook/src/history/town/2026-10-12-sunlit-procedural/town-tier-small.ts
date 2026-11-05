// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-small.ts at commit a10c42e6 (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// SETTLEMENT, TOWN and CITY layouts. A town grows outward and upward through
// the tiers: a farming hamlet with its wind pump, then a market town round a
// square with its geared clock tower and brass water tower, then a walled city
// with aether-lit walls, a church spire, a domed guild hall and an airship.
import { airship, waterTower, windPump } from "./town-steam-parts.js";
import type { TownColor } from "./town-mesh-builder.js";
import {
  church,
  gear,
  clockTower,
  domeHall,
  fountain,
  gatehouse,
  groundPad,
  house,
  houseRow,
  lampPost,
  roundTower,
  smokestack,
  stall,
  tree,
  wallRun,
  type TownBuilders
} from "./town-parts.js";

/** Roofs once a town is wealthy enough for verdigris copper. */
export const STEAM_ROOFS: readonly TownColor[] = ["roofTerracotta", "roofRed", "copper", "roofSlate", "roofTerracotta", "copper"];

export const buildSettlement = (t: TownBuilders): void => {
  groundPad(t, 0.36, 7, "dirt", "cobbleDark");
  house(t, { x: -0.12, z: -0.1, w: 0.18, d: 0.12, wall: "plaster", roof: "roofThatch", chimney: true, roofPitch: 0.75 });
  house(t, { x: 0.14, z: -0.12, w: 0.14, d: 0.11, wall: "plasterWarm", roof: "roofTerracotta", ry: 0.35 });
  house(t, { x: 0.15, z: 0.13, w: 0.13, d: 0.1, wall: "plasterWhite", roof: "roofThatch", ry: -0.5, chimney: true, roofPitch: 0.75 });
  // Barn and its hay.
  house(t, { x: -0.13, z: 0.14, w: 0.16, d: 0.12, wall: "barn", roof: "roofBrown", roofPitch: 0.85, lit: 0 });
  t.body.dome(-0.25, 0, 0.25, 0.04, "roofThatch", 7, 1.1);
  t.body.dome(-0.19, 0, 0.29, 0.03, "roofThatch", 7, 1.1);
  // Well with a little timber hood.
  fountain(t, 0.01, 0.02, 0.03, false);
  t.body.box(-0.017, 0, 0.02, 0.005, 0.05, 0.005, "timberDark");
  t.body.box(0.037, 0, 0.02, 0.005, 0.05, 0.005, "timberDark");
  t.body.gable(0.01, 0.05, 0.02, 0.07, 0.025, 0.045, "roofBrown");
  lampPost(t, 0.07, -0.01, 0.05, "aether");
  // Fence along the barnyard.
  t.body.box(-0.3, 0, 0.02, 0.004, 0.022, 0.2, "timber");
  t.body.box(-0.2, 0, 0.31, 0.2, 0.022, 0.004, "timber");
  tree(t, -0.3, -0.24, 0.15, "leaf");
  windPump(t, 0.33, 0.0, 0.17);
  tree(t, 0.03, -0.31, 0.12, "leaf");
  tree(t, 0.3, 0.3, 0.11, "leaf");
};

export const buildTown = (t: TownBuilders): void => {
  groundPad(t, 0.41, 8, "cobble", "cobbleDark");
  // Road in from the south to the square.
  t.body.box(0, 0, 0.27, 0.075, 0.002, 0.26, "path");
  // Town hall and its clock tower on the north side of the square.
  house(t, { x: -0.06, z: -0.17, w: 0.2, d: 0.12, storeys: 2, wall: "plasterWhite", roof: "roofSlate", hip: true, lit: 0.6 });
  clockTower(t, 0.1, -0.17, 0.07, 0.24, "stone", "roofSlateDark");
  fountain(t, 0, 0.06, 0.045, true);
  stall(t, -0.1, 0.1, 0.25, "awningRed");
  stall(t, 0.1, 0.1, -0.25, "awningBlue");
  stall(t, 0.11, -0.04, -1.2, "awningGold");
  lampPost(t, -0.07, -0.03, 0.05, "aether");
  lampPost(t, 0.07, 0.17, 0.05, "aether");
  waterTower(t, 0.19, -0.27, 0.1, 0.038);
  // Terraces round the square, fronts facing in.
  houseRow(t, -0.33, -0.16, -0.33, 0.16, { depth: 0.09, storeys: [1, 2], facing: -1 });
  houseRow(t, 0.33, 0.16, 0.33, -0.16, { depth: 0.09, storeys: [1, 2], facing: -1 });
  houseRow(t, -0.21, 0.28, -0.06, 0.28, { depth: 0.085, storeys: [1, 1], facing: -1 });
  houseRow(t, 0.06, 0.28, 0.21, 0.28, { depth: 0.085, storeys: [1, 1], facing: -1 });
  tree(t, -0.2, -0.33, 0.14, "leaf");
  tree(t, -0.38, 0.33, 0.12, "pine");
};

export const buildCity = (t: TownBuilders): void => {
  // Square pad: a 4-sided cylinder turned 45 degrees, half-side ~0.44.
  groundPad(t, 0.62, 4, "cobble", "stoneDark");
  const s = 0.39;
  const wallH = 0.1;
  const thickness = 0.028;
  wallRun(t, -s, -s, s, -s, wallH, thickness, "stone", true);
  wallRun(t, s, -s, s, s, wallH, thickness, "stone", true);
  wallRun(t, -s, s, -s, -s, wallH, thickness, "stone", true);
  wallRun(t, -s, s, -0.065, s, wallH, thickness, "stone", true);
  wallRun(t, 0.065, s, s, s, wallH, thickness, "stone", true);
  gatehouse(t, 0, s, 0.09, 0.14, 0, "stone", "roofSlateDark");
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as const) {
    roundTower(t, x, z, 0.044, 0.16, "stone", "roofSlate", 0.1, 0, true);
  }
  t.body.box(0, 0, 0.18, 0.07, 0.002, 0.2, "path");
  // Church in the north-west, domed guild hall in the north-east.
  church(t, -0.13, -0.21, 1, 0, "plasterWhite", "roofSlateDark", "roofSlate");
  domeHall(t, 0.21, -0.2, 0.13, 0.1, "plaster", "copper");
  // Workshop with its stack.
  house(t, { x: 0.15, z: 0.04, w: 0.11, d: 0.08, storeys: 1, wall: "stoneDark", roof: "roofSlateDark", lit: 0.7 });
  smokestack(t, 0.22, 0.04, 0.2, 0.017);
  gear(t, 0.13, 0.04, 0.084, 0.022, 0);
  t.body.pipe(0.18, 0.055, 0.03, 0.21, 0.055, 0.03, 0.006, "iron");
  airship(t, 0.1, 0.44, 0.13, 0.28, 0);
  fountain(t, -0.04, 0.04, 0.04, true);
  lampPost(t, 0.04, 0.12, 0.05, "aether");
  lampPost(t, -0.12, 0.0, 0.05, "aether");
  houseRow(t, -0.31, -0.08, -0.31, 0.3, { depth: 0.08, storeys: [2, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.31, 0.3, 0.31, 0.12, { depth: 0.08, storeys: [2, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.23, 0.3, -0.06, 0.3, { depth: 0.075, storeys: [1, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.06, 0.3, 0.23, 0.3, { depth: 0.075, storeys: [1, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.22, 0.14, -0.08, 0.14, { depth: 0.075, storeys: [2, 2], facing: 1, roofs: STEAM_ROOFS });
  tree(t, 0.04, -0.07, 0.1, "leaf");
  tree(t, -0.2, 0.03, 0.09, "leaf");
};
