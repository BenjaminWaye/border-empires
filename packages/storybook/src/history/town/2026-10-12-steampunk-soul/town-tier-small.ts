// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-small.ts at commit 750ba4bc (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// SETTLEMENT, TOWN and CITY layouts. A town grows outward and upward through
// the tiers: a hamlet of cottages round an aether lamp, with its greenhouse,
// water condenser and wind turbine; then a market town -- a crescent of
// townhouses round a fountain square under a geared clock tower; then a city
// ringed by terraces round a copper-spired sandstone tower, tied to its
// neighbours by skybridges, with an airship overhead.
import { airship, condenser } from "./town-air-parts.js";
import { clockTower, crescent, fountain, house, stall } from "./town-house-parts.js";
import {
  aetherPylon,
  facingOut,
  hydroDome,
  lampPost,
  plazaDeck,
  polar,
  skyBridge,
  tierTower,
  tree,
  windTurbine,
  type TownBuilders
} from "./town-parts.js";

export const buildSettlement = (t: TownBuilders): void => {
  plazaDeck(t, 0.32, "plaza");
  aetherPylon(t, 0, 0, 0.1);
  const cottages = [
    { degrees: 205, w: 0.14, d: 0.1, wall: "plaster", roof: "roofThatch" },
    { degrees: 330, w: 0.12, d: 0.095, wall: "sandstone", roof: "roofTerracotta" },
    { degrees: 80, w: 0.12, d: 0.09, wall: "plasterRose", roof: "roofThatch" }
  ] as const;
  for (const cottage of cottages) {
    const [x, z] = polar(0.17, cottage.degrees);
    house(t, { x, z, w: cottage.w, d: cottage.d, wall: cottage.wall, roof: cottage.roof, ry: facingOut(cottage.degrees + 180), chimney: true, lit: 0.6 });
  }
  const [gx, gz] = polar(0.2, 140);
  hydroDome(t, gx, gz, 0.05);
  condenser(t, 0.34, 0.14, 0.05, 0.028);
  windTurbine(t, -0.35, -0.04, 0.14);
  tree(t, -0.3, -0.25, 0.13, "leaf");
  tree(t, 0.3, -0.26, 0.12, "leaf");
  tree(t, -0.2, 0.33, 0.11, "pine");
};

export const buildTown = (t: TownBuilders): void => {
  plazaDeck(t, 0.4);
  // Terraces on three sides, the square open to the south road.
  crescent(t, 0.3, 190, 350, { depth: 0.085, storeys: [1, 2] });
  crescent(t, 0.3, 15, 70, { depth: 0.085, storeys: [1, 2] });
  crescent(t, 0.3, 110, 165, { depth: 0.085, storeys: [1, 2] });
  clockTower(t, 0, -0.15, 0.07, 0.24);
  tierTower(t, { x: -0.15, z: -0.07, radius: 0.04, tiers: 2, tierH: 0.062, cap: "glassDome", light: "lamp" });
  condenser(t, 0.15, -0.08, 0.06, 0.03);
  fountain(t, 0, 0.05, 0.045);
  stall(t, -0.1, 0.11, 0.3, "awningRed");
  stall(t, 0.1, 0.11, -0.3, "awningBlue");
  lampPost(t, -0.07, -0.03, 0.05, "lamp");
  lampPost(t, 0.07, 0.17, 0.05, "lamp");
  for (const degrees of [80, 100]) {
    const [x, z] = polar(0.36, degrees);
    tree(t, x, z, 0.09, "leaf");
  }
};

export const buildCity = (t: TownBuilders): void => {
  plazaDeck(t, 0.45);
  crescent(t, 0.36, -75, 75, { depth: 0.08, storeys: [2, 3] });
  crescent(t, 0.36, 105, 285, { depth: 0.08, storeys: [2, 3] });
  tierTower(t, { x: 0, z: 0, radius: 0.075, tiers: 4, tierH: 0.08, taper: 0.06, cap: "spire", light: "aether", spireH: 0.14 });
  const flankers = [
    { degrees: 200, cap: "dome" },
    { degrees: 340, cap: "glassDome" }
  ] as const;
  for (const flanker of flankers) {
    const [x, z] = polar(0.18, flanker.degrees);
    tierTower(t, { x, z, radius: 0.05, tiers: 3, tierH: 0.07, cap: flanker.cap, light: "lamp", shell: flanker.degrees === 200 ? "brick" : "sandstone" });
    skyBridge(t, x * 0.42, 0.18, z * 0.42, x * 0.75, 0.16, z * 0.75);
  }
  const [hx, hz] = polar(0.2, 125);
  hydroDome(t, hx, hz, 0.05);
  const [fx, fz] = polar(0.2, 55);
  fountain(t, fx, fz, 0.04);
  lampPost(t, -0.06, 0.2, 0.05, "lamp");
  lampPost(t, 0.06, 0.2, 0.05, "lamp");
  tree(t, 0.0, 0.25, 0.09, "leaf");
  tree(t, -0.22, 0.02, 0.08, "leaf");
  tree(t, 0.22, 0.02, 0.08, "leaf");
  airship(t, -0.12, 0.5, 0.16, 0.22, 0);
};
