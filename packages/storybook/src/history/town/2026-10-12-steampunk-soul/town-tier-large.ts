// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-large.ts at commit 750ba4bc (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// GREAT_CITY and METROPOLIS layouts: rings of tall terraces round twin
// sandstone towers and a terraced garden arcology, or -- for the metropolis --
// a monorail circling the rooftops round a megaspire haloed in brass and
// crowned with an aether crystal, with airships overhead.
import { airship, mooringMast } from "./town-air-parts.js";
import { clockTower, crescent, fountain } from "./town-house-parts.js";
import {
  arcology,
  lampPost,
  monorailRing,
  plazaDeck,
  polar,
  skyBridge,
  tierTower,
  tree,
  type TowerCap,
  type TownBuilders
} from "./town-parts.js";

export const buildGreatCity = (t: TownBuilders): void => {
  plazaDeck(t, 0.46);
  crescent(t, 0.385, -78, 78, { depth: 0.08, storeys: [2, 3] });
  crescent(t, 0.385, 102, 282, { depth: 0.08, storeys: [2, 3] });
  arcology(t, 0, 0.06, 0.11, 3, 0.065);
  // Twin towers behind the arcology, joined high up.
  const [lx, lz] = polar(0.2, 210);
  const [rx, rz] = polar(0.2, 330);
  tierTower(t, { x: lx, z: lz, radius: 0.058, tiers: 6, tierH: 0.068, taper: 0.04, cap: "dome", light: "lamp" });
  tierTower(t, { x: rx, z: rz, radius: 0.058, tiers: 6, tierH: 0.068, taper: 0.04, cap: "spire", light: "aether", spireH: 0.16 });
  skyBridge(t, lx + 0.052, 0.33, lz, rx - 0.052, 0.33, rz);
  skyBridge(t, lx + 0.054, 0.19, lz, rx - 0.054, 0.19, rz);
  clockTower(t, 0, 0.25, 0.065, 0.2);
  fountain(t, -0.2, 0.12, 0.035);
  lampPost(t, -0.08, 0.2, 0.05, "lamp");
  lampPost(t, 0.08, 0.2, 0.05, "lamp");
  tree(t, 0.2, 0.13, 0.08, "leaf");
  tree(t, 0.0, -0.2, 0.08, "leaf");
  // Airship nosed in to a mast on the north-west terrace.
  mooringMast(t, -0.28, -0.04, 0.42);
  airship(t, -0.14, 0.46, -0.04, 0.24, Math.PI);
};

export const buildMetropolis = (t: TownBuilders): void => {
  plazaDeck(t, 0.47);
  crescent(t, 0.385, -80, 80, { depth: 0.07, storeys: [3, 3] });
  crescent(t, 0.385, 100, 280, { depth: 0.07, storeys: [3, 3] });
  // The monorail runs round the city above the rooftops.
  monorailRing(t, 0.44, 0.26, 16);
  // Megaspire: the AFC's printer tower built tall in sandstone, haloed in brass.
  tierTower(t, { x: 0, z: 0, radius: 0.1, tiers: 7, tierH: 0.092, taper: 0.075, cap: "spire", light: "aether", spireH: 0.24 });
  t.body.ring(0, 0.74, 0, 0.12, "brass", 0.05);
  t.body.ring(0, 0.82, 0, 0.085, "brass", 0.06);
  const caps: readonly TowerCap[] = ["dome", "glassDome", "garden", "dome"];
  caps.forEach((cap, i) => {
    const degrees = 45 + i * 90;
    const [x, z] = polar(0.23, degrees);
    tierTower(t, { x, z, radius: 0.052, tiers: i % 2 === 0 ? 5 : 4, tierH: 0.07, taper: 0.03, cap, light: "lamp", shell: i === 2 ? "brick" : "sandstone" });
    skyBridge(t, x * 0.42, 0.3, z * 0.42, x * 0.78, 0.26, z * 0.78);
  });
  const [fx, fz] = polar(0.24, 90);
  fountain(t, fx, fz, 0.04);
  for (const degrees of [0, 180, 270]) {
    const [x, z] = polar(0.25, degrees);
    tree(t, x, z, 0.08, "leaf");
  }
  lampPost(t, -0.07, 0.3, 0.05, "lamp");
  lampPost(t, 0.07, 0.3, 0.05, "lamp");
  airship(t, -0.2, 0.62, 0.22, 0.24, 0);
  airship(t, 0.24, 0.74, -0.08, 0.22, Math.PI / 2);
};
