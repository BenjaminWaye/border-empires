// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-small.ts at commit 2e4f2f72 (2026-10-13).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// SETTLEMENT, TOWN and CITY layouts: clockwork skyscrapers ringed round an
// octagonal plate, fronts to the plaza. A town grows outward and upward: a
// handful of low towers round a cog lamp, then a ring round a brass orrery,
// then a taller ring round three skybridged central towers.
import { lampPost, octagonPlate, polar, skyBridge, tree, type TownBuilders } from "./town-parts.js";
import { cogLamp, orrery, skyscraper, towerRing } from "./town-skyscraper.js";

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
  octagonPlate(t, 0.4);
  towerRing(t, { count: 6, radius: 0.27, startDeg: 30, w: 0.085, h: [0.17, 0.26], crowns: ["clock", "dome", "flat", "spire", "dome", "pod"], annexH: [0.07, 0.1] });
  orrery(t, 0, 0, 1.2);
  for (const degrees of [0, 180]) {
    const [x, z] = polar(0.17, degrees);
    tree(t, x, z, 0.08);
  }
  for (const degrees of [60, 120, 240, 300]) {
    const [x, z] = polar(0.13, degrees);
    lampPost(t, x, z);
  }
};

export const buildCity = (t: TownBuilders): void => {
  octagonPlate(t, 0.44);
  towerRing(t, {
    count: 8, radius: 0.33, startDeg: 22.5, w: 0.08, h: [0.2, 0.3],
    crowns: ["flat", "dome", "clock", "flat", "pod", "dome", "flat", "spire"], annexH: [0.09, 0.14]
  });
  const inner = [
    { degrees: 90, crown: "clock", h: 0.4, shell: "stoneLight" },
    { degrees: 210, crown: "pod", h: 0.46, shell: "stone" },
    { degrees: 330, crown: "fins", h: 0.42, shell: "stoneDark" }
  ] as const;
  const points = inner.map((tower) => polar(0.13, tower.degrees));
  inner.forEach((tower, i) => {
    const [x, z] = points[i]!;
    skyscraper(t, { x, z, w: 0.085, d: 0.085, h: tower.h, ry: Math.PI / 4 + i, crown: tower.crown, shell: tower.shell });
  });
  for (let i = 0; i < points.length; i += 1) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[(i + 1) % points.length]!;
    skyBridge(t, x0, 0.22, z0, x1, 0.22, z1);
  }
  orrery(t, 0, 0, 0.7);
  for (const degrees of [150, 270, 30]) {
    const [x, z] = polar(0.22, degrees);
    lampPost(t, x, z);
  }
};
