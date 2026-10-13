// SETTLEMENT, TOWN and CITY layouts: clockwork skyscrapers on an octagonal
// plate. A town grows outward and upward: a handful of low towers round a cog
// lamp, then a lamplit avenue lined by a stepped skyline and a garden plaza,
// then a city of three quarters -- glass downtown, old stone quarter and park.
import { avenue, lampPost, octagonPlate, polar, skyBridge, tree, type TownBuilders } from "./town-parts.js";
import { buildings, cogLamp, orrery, towerRing } from "./town-skyscraper.js";

export const buildSettlement = (t: TownBuilders): void => {
  octagonPlate(t, 0.32);
  towerRing(t, { count: 4, radius: 0.19, startDeg: 45, w: 0.085, h: [0.09, 0.13], crowns: ["dome", "flat", "dome", "flat"] });
  cogLamp(t, 0, 0, 0.035);
  for (const degrees of [90, 270]) {
    const [x, z] = polar(0.2, degrees);
    tree(t, x, z, 0.09);
  }
  lampPost(t, 0.1, 0.0);
  lampPost(t, -0.1, 0.0);
};

export const buildTown = (t: TownBuilders): void => {
  octagonPlate(t, 0.4, false);
  // A lamplit avenue across the plate: a stepped skyline along its north
  // side up to a glass clock tower, a garden plaza and lower blocks south.
  avenue(t, -0.34, -0.01, 0.34, -0.01, 0.07);
  buildings(t, [
    { x: -0.2, z: -0.17, w: 0.1, d: 0.09, h: 0.19, crown: "dome", shell: "stoneLight" },
    { x: -0.06, z: -0.2, w: 0.085, d: 0.085, h: 0.3, crown: "clock", glass: true, ry: Math.PI / 4 },
    { x: 0.08, z: -0.16, w: 0.12, d: 0.07, h: 0.15, crown: "flat", shell: "stoneDark" },
    { x: 0.21, z: -0.22, w: 0.07, d: 0.07, h: 0.24, crown: "spire", glass: true },
    { x: 0.22, z: -0.1, w: 0.06, d: 0.06, h: 0.09, crown: "flat" },
    { x: 0.06, z: 0.12, w: 0.09, d: 0.08, h: 0.14, crown: "pod", glass: true },
    { x: 0.2, z: 0.08, w: 0.07, d: 0.1, h: 0.18, crown: "fins", shell: "stoneLight" },
    { x: 0.15, z: 0.25, w: 0.1, d: 0.07, h: 0.09, crown: "flat", shell: "stoneDark" },
    { x: -0.02, z: 0.27, w: 0.07, d: 0.07, h: 0.11, crown: "dome", glass: true },
    { x: -0.27, z: 0.11, w: 0.08, d: 0.07, h: 0.12, crown: "flat" },
    { x: -0.24, z: -0.06, w: 0.05, d: 0.05, h: 0.08, crown: "dome", glass: true },
    { x: 0.27, z: 0.2, w: 0.06, d: 0.06, h: 0.12, crown: "dome", shell: "stoneLight" }
  ], 1.12);
  skyBridge(t, -0.15, 0.15, -0.18, -0.09, 0.15, -0.2);
  orrery(t, -0.13, 0.14, 1);
  tree(t, -0.22, 0.22, 0.08);
  tree(t, -0.2, 0.08, 0.07);
  tree(t, -0.06, 0.2, 0.07);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) {
    lampPost(t, x, -0.05);
    lampPost(t, x, 0.03);
  }
};

export const buildCity = (t: TownBuilders): void => {
  octagonPlate(t, 0.44, false);
  // Three quarters: a glass downtown stepping up to a spired tower in the
  // north-east, an older stone quarter to the west, and a park with the
  // orrery and a reflecting pool to the south, joined by a boulevard.
  avenue(t, -0.05, 0.12, 0.13, -0.08, 0.06);
  avenue(t, -0.38, 0.03, -0.02, 0.03, 0.05);
  buildings(t, [
    // Downtown.
    { x: 0.12, z: -0.14, w: 0.09, d: 0.09, h: 0.44, crown: "spire", glass: true },
    { x: 0.25, z: -0.05, w: 0.075, d: 0.075, h: 0.34, crown: "pod", glass: true, shell: "stoneLight" },
    { x: 0.0, z: -0.27, w: 0.08, d: 0.08, h: 0.32, crown: "clock", glass: true, ry: Math.PI / 4 },
    { x: 0.24, z: -0.23, w: 0.065, d: 0.065, h: 0.27, crown: "fins", glass: true, shell: "stoneDark" },
    { x: 0.1, z: 0.0, w: 0.07, d: 0.07, h: 0.22, crown: "dome", glass: true },
    // The old stone quarter.
    { x: -0.18, z: -0.2, w: 0.12, d: 0.08, h: 0.17, crown: "flat", shell: "stoneDark" },
    { x: -0.3, z: -0.06, w: 0.08, d: 0.12, h: 0.14, crown: "dome", shell: "stoneLight" },
    { x: -0.15, z: -0.06, w: 0.07, d: 0.07, h: 0.21, crown: "clock" },
    { x: -0.28, z: 0.12, w: 0.1, d: 0.08, h: 0.12, crown: "flat" },
    // Round the park.
    { x: 0.12, z: 0.2, w: 0.1, d: 0.08, h: 0.15, crown: "pod", glass: true },
    { x: 0.27, z: 0.12, w: 0.07, d: 0.09, h: 0.2, crown: "spire", shell: "stoneLight" },
    { x: -0.16, z: 0.3, w: 0.09, d: 0.07, h: 0.1, crown: "flat", shell: "stoneDark" },
    { x: 0.08, z: 0.32, w: 0.08, d: 0.07, h: 0.09, crown: "flat" },
    { x: -0.3, z: 0.24, w: 0.07, d: 0.07, h: 0.13, crown: "pod", glass: true },
    { x: 0.27, z: 0.27, w: 0.06, d: 0.06, h: 0.11, crown: "dome" },
    { x: -0.06, z: -0.12, w: 0.06, d: 0.06, h: 0.16, crown: "flat", glass: true }
  ], 1.14);
  skyBridge(t, 0.16, 0.26, -0.11, 0.22, 0.24, -0.07);
  skyBridge(t, 0.09, 0.3, -0.18, 0.03, 0.28, -0.24);
  skyBridge(t, 0.16, 0.22, -0.17, 0.21, 0.2, -0.21);
  orrery(t, -0.05, 0.16, 0.9);
  t.body.box(-0.05, 0, 0.27, 0.12, 0.004, 0.05, "water");
  t.body.box(-0.05, 0, 0.27, 0.13, 0.003, 0.06, "brassDark");
  tree(t, -0.15, 0.17, 0.07);
  tree(t, 0.03, 0.22, 0.07);
  tree(t, -0.17, 0.07, 0.06);
  for (const [x, z] of [[0.0, 0.08], [0.07, -0.01], [-0.25, 0.0], [-0.1, 0.0]] as const) lampPost(t, x, z);
};
