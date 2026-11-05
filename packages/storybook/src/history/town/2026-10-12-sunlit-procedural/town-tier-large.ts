// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-large.ts at commit a10c42e6 (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// GREAT_CITY and METROPOLIS layouts: tall aether-lit curtain walls ringed
// with beacon towers, a glass-domed palace or a central citadel spire haloed
// in brass, a cathedral, a geared clock tower, a smoky industrial quarter and
// airships overhead, all packed with two- and three-storey terraces.
// The tile centre is left clear of tall pieces: the capital banner pole
// (client-map-3d-village-fx.ts) stands there.
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
  tree,
  wallRun,
  type TownBuilders
} from "./town-parts.js";
import type { TownColor } from "./town-mesh-builder.js";
import { airship, mooringMast, waterTower } from "./town-steam-parts.js";
import { STEAM_ROOFS } from "./town-tier-small.js";

const curtainWall = (
  t: TownBuilders, s: number, h: number, thickness: number, gateGap: number, color: TownColor
): void => {
  wallRun(t, -s, -s, s, -s, h, thickness, color, true);
  wallRun(t, s, -s, s, s, h, thickness, color, true);
  wallRun(t, -s, s, -s, -s, h, thickness, color, true);
  wallRun(t, -s, s, -gateGap / 2 - 0.02, s, h, thickness, color, true);
  wallRun(t, gateGap / 2 + 0.02, s, s, s, h, thickness, color, true);
};

export const buildGreatCity = (t: TownBuilders): void => {
  groundPad(t, 0.65, 4, "cobble", "stoneDark");
  const s = 0.41;
  curtainWall(t, s, 0.13, 0.032, 0.1, "stone");
  gatehouse(t, 0, s, 0.1, 0.18, 0, "stone", "roofSlateDark");
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as const) {
    roundTower(t, x, z, 0.05, 0.2, "stone", "roofSlateDark", 0.12, 0, true);
  }
  roundTower(t, -s, 0, 0.044, 0.18, "stone", "roofSlate", 0.1, 0, true);
  roundTower(t, s, 0, 0.044, 0.18, "stone", "roofSlate", 0.1, 0, true);
  // Avenue from the gate up to the palace.
  t.body.box(0, 0, 0.12, 0.08, 0.002, 0.56, "path");
  // Palace: domed centre block between two copper-roofed wings.
  domeHall(t, 0, -0.24, 0.15, 0.17, "plasterWhite", "aetherGlass");
  house(t, { x: -0.15, z: -0.25, w: 0.12, d: 0.1, storeys: 2, wall: "plasterWhite", roof: "copper", hip: true, lit: 0.7 });
  house(t, { x: 0.15, z: -0.25, w: 0.12, d: 0.1, storeys: 2, wall: "plasterWhite", roof: "copper", hip: true, lit: 0.7 });
  church(t, -0.15, 0.1, 1.4, 0, "plaster", "roofSlate", "roofSlateDark");
  clockTower(t, 0.22, -0.02, 0.08, 0.4, "stone", "roofSlateDark");
  // Industrial corner by the south-east wall.
  house(t, { x: 0.18, z: 0.24, w: 0.13, d: 0.085, storeys: 2, wall: "stoneDark", roof: "roofSlateDark", lit: 0.8 });
  smokestack(t, 0.09, 0.2, 0.3, 0.02);
  smokestack(t, 0.27, 0.15, 0.26, 0.018);
  t.body.pipe(0.115, 0.13, 0.24, 0.09, 0.13, 0.2, 0.007, "iron");
  t.body.pipe(0.245, 0.13, 0.2, 0.27, 0.13, 0.15, 0.007, "iron");
  fountain(t, 0.07, -0.08, 0.035, true);
  lampPost(t, -0.055, 0.0, 0.05, "aether");
  lampPost(t, 0.055, 0.24, 0.05, "aether");
  mooringMast(t, -0.25, -0.03, 0.5);
  // Nose-in to its mast.
  airship(t, -0.08, 0.53, -0.03, 0.3, Math.PI);
  houseRow(t, -0.335, -0.33, -0.335, 0.33, { depth: 0.08, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.335, 0.33, 0.335, 0.06, { depth: 0.08, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.335, -0.08, 0.335, -0.33, { depth: 0.08, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.27, 0.335, -0.07, 0.335, { depth: 0.075, storeys: [1, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.07, 0.335, 0.27, 0.335, { depth: 0.075, storeys: [1, 2], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.26, -0.11, -0.07, -0.11, { depth: 0.075, storeys: [2, 2], facing: 1, roofs: STEAM_ROOFS });
  tree(t, -0.03, -0.1, 0.09, "leaf");
  tree(t, 0.13, 0.08, 0.09, "leaf");
};

/** The metropolis's citadel: stepped bastion, ring of copper domes and a tall
 * spire crowned with a glowing aether crystal. Returns the crystal's top. */
const citadel = (t: TownBuilders, x: number, z: number): number => {
  t.body.box(x, 0, z, 0.3, 0.04, 0.26, "stoneDark");
  t.body.box(x, 0.04, z, 0.23, 0.05, 0.2, "stone");
  for (const [dx, dz] of [[-0.085, -0.07], [0.085, -0.07], [-0.085, 0.07], [0.085, 0.07]] as const) {
    t.body.cylinder(x + dx, 0.09, z + dz, 0.034, 0.034, 0.07, "plasterWhite", 10);
    t.glow.dome(x + dx, 0.16, z + dz, 0.038, "aetherGlass", 10, 1.1);
    t.body.ring(x + dx, 0.163, z + dz, 0.039, "brass");
    t.body.gem(x + dx, 0.21, z + dz, 0.007, 0.014, "brass");
    t.glow.panel(x + dx, 0.125, z + dz + 0.0345, 0.012, 0.022, "lamp");
  }
  const spireBase = 0.09;
  t.body.cylinder(x, spireBase, z, 0.05, 0.058, 0.42, "plasterWhite", 12);
  for (const ringY of [0.18, 0.33]) t.body.cylinder(x, spireBase + ringY, z, 0.056, 0.056, 0.014, "brass", 12);
  const topOfShaft = spireBase + 0.42;
  t.body.cylinder(x, topOfShaft, z, 0.064, 0.064, 0.016, "stoneDark", 12);
  t.body.cylinder(x, topOfShaft + 0.016, z, 0.036, 0.044, 0.1, "brass", 8);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    t.glow.panel(x + Math.sin(angle) * 0.041, topOfShaft + 0.065, z + Math.cos(angle) * 0.041, 0.016, 0.05, "aether", angle);
  }
  const coneBase = topOfShaft + 0.116;
  t.body.cone(x, coneBase, z, 0.05, 0.24, "copper", 8);
  // Brass halo rings floating round the spire.
  t.body.ring(x, coneBase + 0.02, z, 0.1, "brass");
  t.body.ring(x, coneBase + 0.09, z, 0.075, "brass");
  gear(t, x, topOfShaft - 0.06, z + 0.052, 0.034, 0);
  t.glow.gem(x, coneBase + 0.24 + 0.05, z, 0.026, 0.06, "aether");
  return coneBase + 0.24 + 0.11;
};

export const buildMetropolis = (t: TownBuilders): void => {
  groundPad(t, 0.65, 4, "cobble", "stoneDeep");
  const s = 0.42;
  curtainWall(t, s, 0.15, 0.036, 0.1, "stone");
  gatehouse(t, 0, s, 0.1, 0.22, 0, "stone", "roofSlateDark");
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as const) {
    roundTower(t, x, z, 0.056, 0.23, "stone", "roofSlateDark", 0.13, 0, true);
  }
  for (const [x, z] of [[-s, 0], [s, 0], [0, -s]] as const) {
    roundTower(t, x, z, 0.048, 0.21, "stone", "roofSlate", 0.11, 0, true);
  }
  t.body.box(0, 0, 0.18, 0.08, 0.002, 0.44, "path");
  // Aether conduit glowing down the avenue from the citadel to the gate.
  t.glow.box(0, 0.002, 0.2, 0.012, 0.003, 0.4, "aether");
  citadel(t, 0, -0.1);
  church(t, -0.22, -0.27, 1.2, 0, "plaster", "roofSlateDark", "roofSlate");
  clockTower(t, 0.1, -0.31, 0.075, 0.46, "stone", "roofSlateDark");
  domeHall(t, 0.26, -0.25, 0.12, 0.13, "plasterWarm", "copper");
  // Guild hall and factory either side of the avenue.
  house(t, { x: -0.22, z: 0.04, w: 0.12, d: 0.085, storeys: 3, wall: "plasterWhite", roof: "roofSlate", hip: true, lit: 0.7 });
  house(t, { x: 0.22, z: 0.04, w: 0.11, d: 0.08, storeys: 2, wall: "stoneDark", roof: "roofSlateDark", lit: 0.8 });
  smokestack(t, 0.2, -0.06, 0.34, 0.02);
  smokestack(t, 0.26, -0.07, 0.3, 0.018);
  t.body.pipe(0.2, 0.12, -0.04, 0.2, 0.12, 0.0, 0.007, "iron");
  waterTower(t, -0.22, -0.1, 0.16, 0.035);
  airship(t, -0.2, 0.62, 0.12, 0.3, 0);
  airship(t, 0.22, 0.76, -0.1, 0.26, Math.PI / 2);
  houseRow(t, -0.345, -0.15, -0.345, 0.345, { depth: 0.08, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.345, 0.345, 0.345, -0.15, { depth: 0.08, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.28, 0.345, -0.07, 0.345, { depth: 0.075, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, 0.07, 0.345, 0.28, 0.345, { depth: 0.075, storeys: [2, 3], facing: -1, roofs: STEAM_ROOFS });
  houseRow(t, -0.26, 0.2, -0.07, 0.2, { depth: 0.075, storeys: [2, 3], facing: 1, roofs: STEAM_ROOFS });
  houseRow(t, 0.07, 0.2, 0.26, 0.2, { depth: 0.075, storeys: [2, 3], facing: 1, roofs: STEAM_ROOFS });
  lampPost(t, -0.055, 0.1, 0.05, "aether");
  lampPost(t, 0.055, 0.1, 0.05, "aether");
  lampPost(t, -0.055, 0.3, 0.05, "aether");
  lampPost(t, 0.055, 0.3, 0.05, "aether");
  tree(t, -0.11, 0.08, 0.08, "leaf");
  tree(t, 0.11, 0.09, 0.08, "leaf");
};
