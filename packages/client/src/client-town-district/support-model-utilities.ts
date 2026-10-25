import { spinning, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { band, housing, ribs, vessel } from "./support-model-detail.js";

export const buildUtility = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "HYDROWORKS":
      // Open settling basin and a sealed turbine pump.
      housing(t, -0.145, -0.08, 0.13, 0.16, 0.24);
      t.body.cylinder(0.095, 0.012, 0.035, 0.14, 0.16, 0.07, "stoneLight", 12);
      t.body.cylinder(0.095, 0.083, 0.035, 0.123, 0.123, 0.003, "water", 12);
      t.body.cylinder(0.095, 0.086, 0.035, 0.015, 0.025, 0.055, "brass", 8);
      t.body.pipe(-0.13, 0.16, -0.08, 0.095, 0.16, 0.035, 0.014, "brassDark");
      t.body.pipe(0.095, 0.16, 0.035, 0.095, 0.11, 0.035, 0.014, "brass");
      t.body.disc(-0.13, 0.16, 0.095, 0.075, 0.025, "iron");
      t.body.disc(-0.13, 0.16, 0.113, 0.055, 0.012, "brassDark");
      t.glow.disc(-0.13, 0.16, 0.122, 0.026, 0.006, "aether");
      for (const z of [0.16, 0.22]) t.body.box(0.09, 0.015, z, 0.22, 0.012, 0.025, "water");
      for (const x of [-0.17, 0.16]) t.body.box(x, 0.008, 0.21, 0.06, 0.025, 0.045, "stoneLight");
      return true;
    case "ORE_REFINERY":
      // Twin square smelter stacks and a sloping raw-ore feed chute.
      for (const x of [-0.13, 0.06]) {
        t.body.box(x, 0.015, -0.07, 0.14, 0.035, 0.19, "stoneLight");
        t.body.pyramid(x, 0.05, -0.07, 0.14, 0.1, 0.19, "iron");
        t.body.box(x, 0.15, -0.07, 0.08, x < 0 ? 0.23 : 0.16, 0.09, "stoneDark");
        t.body.box(x, x < 0 ? 0.36 : 0.29, -0.07, 0.1, 0.025, 0.11, "brassDark");
        t.body.box(x, 0.055, 0.032, 0.065, 0.065, 0.012, "ironDark");
        t.glow.box(x, 0.065, 0.04, 0.045, 0.04, 0.005, "lampWarm");
      }
      t.body.box(0, 0.01, 0.18, 0.35, 0.025, 0.09, "ironDark");
      for (const x of [-0.13, -0.04, 0.05, 0.14]) t.body.gem(x, 0.065, 0.18, 0.035, 0.045, "stoneDark");
      t.body.pipe(0.19, 0.03, 0.17, 0.19, 0.22, -0.12, 0.028, "iron");
      ribs(t, 0.19, 0.19, -0.15, 0.09, 4, 0.04, 0.1);
      return true;
    case "SKY_DOCK":
      // Armed aerial bombardment craft, launch rails and ordnance servicing.
      housing(t, -0.16, 0.08, 0.1, 0.12, 0.22);
      for (const z of [-0.16, 0.14]) {
        t.body.box(0.1, 0.015, z, 0.18, 0.028, 0.06, "stoneLight");
        t.body.box(0.1, 0.043, z, 0.028, 0.19, 0.035, "iron");
      }
      t.body.box(0.1, 0.235, -0.01, 0.19, 0.025, 0.36, "iron");
      for (const x of [0.005, 0.195]) t.body.pipe(x, 0.27, -0.17, x, 0.27, 0.15, 0.006, "brass");
      t.body.gem(0.005, 0.36, -0.025, 0.17, 0.018, "iron");
      t.body.ellipsoid(0.045, 0.37, -0.025, 0.2, 0.045, 0.06, "stoneLight");
      t.body.ellipsoid(0.13, 0.405, -0.025, 0.065, 0.018, 0.035, "glassLight");
      for (const z of [-0.11, 0.06]) {
        t.body.pipe(0.025, 0.323, z, 0.15, 0.323, z, 0.013, "ironDark");
        t.body.box(0.015, 0.307, z, 0.13, 0.015, 0.028, "brassDark");
      }
      t.body.box(-0.16, 0.015, -0.17, 0.09, 0.04, 0.08, "ironDark");
      for (const z of [-0.125, 0.075]) {
        t.body.pipe(-0.17, 0.365, z, -0.04, 0.365, z, 0.025, "ironDark");
        t.body.disc(-0.176, 0.365, z, 0.027, 0.012, "brassDark", Math.PI / 2);
        t.glow.disc(-0.184, 0.365, z, 0.018, 0.004, "aether", Math.PI / 2);
        t.body.pipe(0.045, 0.27, z * 0.45, 0.045, 0.33, z * 0.45, 0.009, "iron");
      }
      return true;
    case "AMBARIC_TRANSFORMER":
      // Two massive fin banks and a low horseshoe busbar.
      for (const x of [-0.13, 0.13]) {
        t.body.box(x, 0.015, -0.035, 0.14, 0.035, 0.21, "stoneLight");
        ribs(t, x, 0.05, -0.035, 0.125, 7, 0.18, 0.18);
        for (const z of [-0.08, 0.015]) {
          t.body.cylinder(x, 0.24, z, 0.018, 0.028, 0.09, "stoneLight", 6);
          band(t, x, 0.28, z, 0.03);
          t.glow.gem(x, 0.35, z, 0.015, 0.025, "aether");
        }
      }
      for (const x of [-0.13, 0.13]) t.body.pipe(x, 0.12, 0.04, x, 0.12, 0.18, 0.017, "brass");
      t.body.pipe(-0.13, 0.12, 0.18, 0.13, 0.12, 0.18, 0.017, "brass");
      return true;
    case "RELAY_BEACON":
      // Cheap forward observation/staging equipment, without a siege weapon.
      housing(t, -0.115, 0.04, 0.13, 0.075, 0.15);
      t.body.cylinder(0.065, 0.015, -0.055, 0.065, 0.09, 0.035, "stoneLight", 8);
      for (const x of [-0.005, 0.135]) {
        t.body.pipe(x, 0.05, -0.055, 0.065, 0.3, -0.055, 0.012, "iron");
      }
      t.body.pipe(0.065, 0.05, -0.13, 0.065, 0.3, -0.055, 0.012, "iron");
      spinning(t, 0.065, 0.325, -0.055, [0, 1, 0], 0.16, () => {
        t.body.box(0.065, 0.3, -0.055, 0.11, 0.055, 0.075, "iron");
        for (const x of [0.035, 0.095]) t.glow.disc(x, 0.327, -0.011, 0.014, 0.006, "lamp");
        t.body.box(0.065, 0.36, -0.055, 0.13, 0.012, 0.09, "brassDark");
      });
      for (const x of [-0.11, 0.02, 0.15]) {
        t.body.box(x, 0.015, 0.16, 0.075, 0.03, 0.07, "ironDark");
        t.glow.box(x, 0.047, 0.16, 0.04, 0.004, 0.04, "aether");
      }
      return true;
    case "OBSERVATORY":
      // Armillary instrument in an open three-legged cradle.
      t.body.cylinder(0, 0.012, 0, 0.16, 0.19, 0.045, "stoneLight", 10);
      vessel(t, 0, 0, 0.065, 0.08);
      for (let i = 0; i < 3; i += 1) {
        const a = i * Math.PI * 2 / 3;
        t.body.pipe(Math.sin(a) * 0.17, 0.045, Math.cos(a) * 0.17, Math.sin(a) * 0.1, 0.26, Math.cos(a) * 0.1, 0.017, "iron");
      }
      spinning(t, 0, 0.29, 0, [0, 0, 1], 0.2, () => {
        t.body.ring(0, 0.29, 0, 0.13, "brass", 0.06);
        t.body.pipe(-0.08, 0.21, 0, 0.08, 0.37, 0, 0.012, "brassDark");
        t.glow.gem(0, 0.29, 0, 0.04, 0.085, "aether");
      });
      housing(t, 0, 0.21, 0.16, 0.055, 0.065);
      return true;
    default: return false;
  }
};
