import { gear, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { depot } from "./support-model-core.js";
import { band, gantry, housing } from "./support-model-detail.js";

export const buildManpower = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "ANCILLARY_DEPOT": depot(t); return true;
    case "INCUBATION_ENGINE":
      // Four reclined growth capsules, one overhead nutrient distributor.
      housing(t, 0, -0.17, 0.36, 0.1, 0.085);
      for (const x of [-0.18, -0.06, 0.06, 0.18]) {
        t.body.box(x, 0.015, 0.025, 0.085, 0.04, 0.27, "stoneLight");
        t.body.ellipsoid(x, 0.105, 0.025, 0.043, 0.05, 0.12, "glassLight");
        for (const z of [-0.065, 0.11]) t.body.box(x, 0.05, z, 0.09, 0.07, 0.018, "brassDark");
        t.glow.pipe(x, 0.115, -0.04, x, 0.115, 0.09, 0.005, "aether");
      }
      t.body.cylinder(0, 0.15, -0.17, 0.045, 0.065, 0.16, "iron", 8);
      band(t, 0, 0.29, -0.17, 0.06);
      for (const x of [-0.18, 0.18]) t.body.pipe(x, 0.09, 0, 0, 0.26, -0.17, 0.008, "brass");
      return true;
    case "NEURAL_WORKS":
      // Connected-network mustering command centre, with visible dispatch bays.
      housing(t, 0, -0.045, 0.29, 0.19, 0.22);
      t.body.box(0, 0.21, -0.02, 0.34, 0.065, 0.15, "iron");
      t.body.box(0, 0.228, 0.058, 0.28, 0.035, 0.008, "glassLight");
      t.body.box(0, 0.279, -0.02, 0.37, 0.015, 0.18, "brassDark");
      for (const x of [-0.17, 0.17]) {
        t.body.box(x, 0.015, 0.095, 0.075, 0.11, 0.15, "stoneLight");
        t.body.box(x, 0.045, 0.174, 0.045, 0.065, 0.009, "ironDark");
        t.glow.pipe(x, 0.022, 0.19, x, 0.022, 0.27, 0.005, "aether");
        t.body.pipe(x, 0.28, -0.08, x, 0.39, -0.08, 0.006, "brass");
      }
      t.body.box(0, 0.297, -0.04, 0.12, 0.025, 0.08, "glass");
      t.glow.box(0, 0.13, 0.071, 0.13, 0.025, 0.005, "aether");
      return true;
    case "ANCILLARY_FACTORY":
      // Exposed assembly spine and three work cells beneath a travelling beam.
      housing(t, 0, -0.16, 0.39, 0.13, 0.1);
      gantry(t, 0, 0.025, 0.4, 0.27, 0.04);
      t.body.box(0, 0.015, 0.08, 0.33, 0.03, 0.19, "ironDark");
      for (const x of [-0.12, 0, 0.12]) {
        t.body.cylinder(x, 0.045, 0.06, 0.026, 0.04, 0.04, "iron", 8);
        t.body.gem(x, 0.13, 0.06, 0.022, 0.085, "stoneLight");
        t.body.pipe(x, 0.28, 0.025, x, 0.2, 0.075, 0.009, "brass");
        t.body.pipe(x, 0.2, 0.075, x + 0.04, 0.15, 0.075, 0.007, "iron");
      }
      gear(t, 0.2, 0.13, -0.08, 0.048, Math.PI / 2, 0.4);
      return true;
    case "RESERVE_LATTICE":
      // Open coordination lattice: network nodes, not another ancillary vault.
      for (const x of [-0.2, 0.2]) for (const z of [-0.12, 0.12]) {
        t.body.box(x, 0.015, z, 0.035, 0.03, 0.045, "stoneLight");
        t.body.box(x, 0.045, z, 0.018, 0.3, 0.018, "iron");
      }
      for (const y of [0.12, 0.3]) {
        t.body.box(0, y, 0, 0.44, 0.018, 0.28, "brassDark");
        for (const x of [-0.14, 0, 0.14]) {
          t.body.box(x, y + 0.018, 0, 0.045, 0.055, 0.065, "iron");
          t.glow.box(x, y + 0.034, 0.035, 0.025, 0.02, 0.005, "aether");
        }
      }
      for (const z of [-0.12, 0.12]) {
        t.body.pipe(-0.2, 0.05, z, 0.2, 0.3, z, 0.008, "brass");
        t.body.pipe(0.2, 0.05, z, -0.2, 0.3, z, 0.008, "brass");
      }
      t.body.box(0, 0.015, 0.2, 0.16, 0.065, 0.065, "stoneLight");
      return true;
    default: return false;
  }
};
