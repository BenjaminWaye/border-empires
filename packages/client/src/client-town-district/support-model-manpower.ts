import { gear, spinning, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { depot } from "./support-model-core.js";
import { band, gantry, housing, ribs } from "./support-model-detail.js";

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
      // A split hemisphere in an angular cradle, not another beacon spire.
      t.body.cylinder(0, 0.015, 0, 0.13, 0.17, 0.06, "stoneLight", 10);
      t.body.dome(0, 0.13, 0, 0.13, "glass", 12, 1);
      for (const x of [-0.19, 0.19]) {
        t.body.box(x, 0.02, 0, 0.035, 0.28, 0.15, "iron");
        t.body.pipe(x, 0.3, 0, x * 0.4, 0.37, 0, 0.012, "brass");
        t.glow.pipe(x * 0.4, 0.37, 0, 0, 0.33, 0, 0.004, "aether");
      }
      t.body.box(0, 0.13, 0, 0.012, 0.14, 0.26, "brass");
      for (const x of [-0.1, 0.1]) ribs(t, x, 0.015, 0.19, 0.12, 4, 0.06, 0.07);
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
      // Six sealed reserve cells in a tall two-level honeycomb rack.
      for (const x of [-0.14, 0, 0.14]) for (const y of [0.055, 0.22]) {
        t.body.pipe(x, y, -0.12, x, y, 0.1, 0.055, "ironDark");
        t.body.disc(x, y, 0.115, 0.057, 0.025, "brassDark");
        t.body.disc(x, y, 0.132, 0.038, 0.012, "glass");
        t.glow.box(x, y - 0.006, 0.143, 0.035, 0.008, 0.005, "aether");
      }
      for (const x of [-0.23, 0.23]) t.body.box(x, 0.015, -0.005, 0.023, 0.32, 0.27, "stoneLight");
      for (const y of [0.012, 0.16, 0.33]) t.body.box(0, y, -0.005, 0.48, 0.016, 0.28, "iron");
      spinning(t, 0, 0.375, -0.005, [0, 1, 0], 0.25, () => t.body.box(0, 0.37, -0.005, 0.12, 0.014, 0.05, "brass"));
      return true;
    default: return false;
  }
};
