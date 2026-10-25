import { gear, spinning, steamVent, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { condenser, crate, depot, hall, manufactory, windowStrip } from "./support-model-core.js";

export const buildIndustry = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "MANUFACTORY": manufactory(t); return true;
    case "ANCILLARY_DEPOT": depot(t); return true;
    case "AETHER_CONDENSER": case "HIGH_YIELD_AETHER_CONDENSER":
      condenser(t);
      if (kind === "HIGH_YIELD_AETHER_CONDENSER") {
        for (const x of [-0.24, 0.24]) {
          t.body.cylinder(x, 0.02, -0.04, 0.03, 0.035, 0.24, "iron", 8);
          t.body.cylinder(x, 0.236, -0.04, 0.04, 0.04, 0.008, "brass", 8);
          t.glow.pipe(x, 0.06, -0.004, x, 0.23, -0.004, 0.005, "aether");
        }
      }
      return true;
    case "TITANIUM_WORKS": case "HIGH_YIELD_TITANIUM_WORKS":
    case "UMBRITE_WORKS": case "HIGH_YIELD_UMBRITE_WORKS": {
      const umbrite = kind.includes("UMBRITE");
      hall(t, -0.075, -0.065, 0.24, 0.16, 0.23);
      t.body.cylinder(0.14, 0.015, -0.03, 0.085, 0.1, 0.055, "stoneLight", 8);
      t.body.cylinder(0.14, 0.07, -0.03, 0.073, 0.073, 0.2, "iron", 8);
      t.body.dome(0.14, 0.27, -0.03, 0.073, "graphite", 8, 0.6);
      for (const y of [0.08, 0.16, 0.25]) t.body.ring(0.14, y, -0.03, 0.076, "brass", 0.07);
      t.glow.box(0.14, 0.12, 0.045, 0.045, 0.09, 0.006, umbrite ? "lampWarm" : "aether");
      t.body.pipe(0.06, 0.18, -0.03, -0.06, 0.18, -0.03, 0.014, "brass");
      for (const x of [-0.18, -0.08, 0.02]) {
        t.body.box(x, 0.008, 0.16, 0.08, 0.02, 0.1, "iron");
        if (umbrite) t.body.gem(x, 0.04, 0.16, 0.034, 0.05, "ironDark");
        else for (const dz of [-0.025, 0.025]) t.body.box(x, 0.033, 0.16 + dz, 0.055, 0.024, 0.03, "stoneLight");
      }
      steamVent(t, -0.15, 0.24, -0.13, umbrite ? 0.14 : 0.09);
      if (kind.startsWith("HIGH_YIELD")) {
        hall(t, -0.1, 0.12, 0.15, 0.085, 0.12);
        gear(t, -0.1, 0.17, 0.2, 0.05, 0, 0.6);
        steamVent(t, 0.22, 0.02, -0.16, 0.22);
      }
      return true;
    }
    case "TITANIUM_WEAPONS_FACTORY": case "UMBRITE_WEAPONS_FACTORY": case "WEAPONS_WORKSHOP": {
      const umbrite = kind === "UMBRITE_WEAPONS_FACTORY";
      hall(t, -0.04, -0.08, 0.36, 0.18, 0.25);
      t.body.box(-0.12, 0.015, 0.13, 0.17, 0.025, 0.1, "iron");
      t.body.box(-0.12, 0.04, 0.13, 0.09, 0.06, 0.065, "brassDark");
      t.body.box(-0.12, 0.1, 0.13, 0.055, 0.065, 0.05, "iron");
      for (const x of [0.07, 0.13, 0.19]) {
        t.body.cylinder(x, 0.008, 0.17, 0.017, 0.022, 0.1, "brass", 8);
        t.body.cone(x, 0.108, 0.17, 0.017, 0.04, "iron", 8);
      }
      steamVent(t, -0.17, 0.29, -0.15, 0.13);
      steamVent(t, 0.1, 0.29, -0.15, 0.1);
      if (umbrite) {
        t.body.cylinder(0.2, 0.02, -0.015, 0.06, 0.07, 0.24, "ironDark", 8);
        t.body.cone(0.2, 0.26, -0.015, 0.07, 0.07, "graphite", 8);
        t.glow.box(0.2, 0.09, 0.047, 0.018, 0.13, 0.008, "lampWarm");
        for (const y of [0.04, 0.23]) t.body.ring(0.2, y, -0.015, 0.066, "brass");
      } else {
        t.body.box(0.22, 0.03, -0.02, 0.06, 0.13, 0.1, "stoneLight");
        gear(t, 0.23, 0.19, 0.04, 0.04, 0, 0.5);
      }
      crate(t, -0.22, 0.1);
      return true;
    }
    case "INCUBATION_ENGINE":
      hall(t, 0, -0.12, 0.28, 0.13, 0.12);
      for (const x of [-0.14, 0, 0.14]) {
        t.body.cylinder(x, 0.01, 0.055, 0.052, 0.06, 0.025, "brass", 8);
        t.body.cylinder(x, 0.035, 0.055, 0.045, 0.045, 0.15, "glass", 10);
        t.body.dome(x, 0.185, 0.055, 0.049, "graphite", 10, 0.5);
        t.glow.gem(x, 0.105, 0.055, 0.017, 0.055, "aether");
        t.body.ring(x, 0.042, 0.055, 0.05, "brass", 0.06);
      }
      t.body.pipe(-0.14, 0.055, 0.16, 0.14, 0.055, 0.16, 0.014, "iron");
      return true;
    case "NEURAL_WORKS":
      hall(t, 0, 0.08, 0.3, 0.1, 0.17);
      t.body.cylinder(0, 0.01, -0.12, 0.11, 0.13, 0.15, "iron", 12);
      t.body.dome(0, 0.16, -0.12, 0.115, "glass", 12, 0.7);
      for (const x of [-0.21, 0.21]) {
        t.body.cylinder(x, 0.01, -0.06, 0.027, 0.034, 0.26, "iron", 8);
        t.glow.gem(x, 0.29, -0.06, 0.018, 0.03, "aether");
        t.body.pipe(x, 0.14, -0.06, 0, 0.14, -0.12, 0.009, "brass");
      }
      return true;
    case "ANCILLARY_FACTORY":
      hall(t, -0.05, -0.09, 0.34, 0.15, 0.21);
      for (const x of [-0.16, -0.05, 0.06]) {
        t.body.box(x, 0.01, 0.12, 0.07, 0.035, 0.16, "iron");
        t.body.box(x, 0.045, 0.1, 0.02, 0.11, 0.022, "brass");
        t.body.box(x + 0.015, 0.14, 0.12, 0.05, 0.018, 0.065, "brassDark");
        t.body.gem(x, 0.065, 0.19, 0.018, 0.038, "stoneLight");
      }
      gear(t, 0.2, 0.12, 0.03, 0.06, Math.PI / 2, 0.5);
      steamVent(t, -0.15, 0.26, -0.13, 0.1);
      return true;
    case "RESERVE_LATTICE":
      hall(t, 0, 0.18, 0.22, 0.085, 0.1);
      for (const x of [-0.16, 0, 0.16]) for (const z of [-0.15, 0.015]) {
        t.body.cylinder(x, 0.015, z, 0.032, 0.04, 0.15, "iron", 8);
        t.body.cone(x, 0.165, z, 0.045, 0.035, "brass", 8);
        t.glow.box(x, 0.07, z + 0.033, 0.013, 0.075, 0.005, "aether");
        if (x < 0.16) t.body.pipe(x, 0.13, z, x + 0.16, 0.13, z, 0.009, "brassDark");
        if (z < 0) t.body.pipe(x, 0.13, z, x, 0.13, 0.015, 0.009, "brassDark");
      }
      return true;
    case "CENSUS_HALL": case "CLEARING_HOUSE": case "MINISTRY_HALL": case "QUARTERMASTERS_OFFICE": {
      const tall = kind === "MINISTRY_HALL";
      hall(t, 0, -0.04, 0.36, tall ? 0.24 : 0.16, 0.25);
      t.body.box(0, 0.015, 0.14, 0.16, 0.025, 0.1, "stoneLight");
      for (const x of [-0.065, 0.065]) t.body.cylinder(x, 0.04, 0.16, 0.009, 0.011, 0.13, "stoneLight", 8);
      t.body.gable(0, 0.17, 0.16, 0.18, 0.05, 0.08, "stoneLight");
      t.body.box(0, 0.04, 0.09, 0.05, 0.09, 0.015, "ironDark");
      if (kind === "CENSUS_HALL") {
        t.body.box(0, 0.24, -0.04, 0.1, 0.09, 0.08, "stone");
        t.body.pyramid(0, 0.33, -0.04, 0.12, 0.07, 0.1, "graphite");
        t.glow.disc(0, 0.29, 0.003, 0.025, 0.004, "lamp");
      } else if (kind === "CLEARING_HOUSE") {
        t.body.dome(0, 0.27, -0.04, 0.075, "brass", 12, 0.6);
        for (const x of [-0.2, 0.2]) crate(t, x, 0.16);
      } else if (tall) windowStrip(t, 0, 0.185, 0.091, 5);
      else for (const x of [-0.2, 0.2]) { crate(t, x, 0.13); crate(t, x, 0.2); }
      return true;
    }
    case "TRADE_NEXUS":
      hall(t, 0, -0.08, 0.4, 0.13, 0.23);
      for (const x of [-0.16, 0, 0.16]) {
        t.body.box(x, 0.03, 0.048, 0.07, 0.09, 0.012, "ironDark");
        crate(t, x, 0.16);
      }
      t.body.cylinder(0.2, 0.015, 0.14, 0.011, 0.022, 0.26, "iron", 8);
      t.body.pipe(0.2, 0.275, 0.14, -0.04, 0.275, 0.14, 0.008, "brass");
      t.body.pipe(-0.04, 0.275, 0.14, -0.04, 0.17, 0.14, 0.002, "ironDark");
      t.body.box(-0.04, 0.12, 0.14, 0.045, 0.05, 0.045, "trunk");
      return true;
    case "RESONANCE_GRID":
      hall(t, 0, 0.18, 0.2, 0.085, 0.1);
      for (const x of [-0.16, 0.16]) for (const z of [-0.14, 0.04]) {
        t.body.cylinder(x, 0.01, z, 0.022, 0.035, 0.22, "iron", 8);
        for (const y of [0.08, 0.13, 0.18]) t.body.ring(x, y, z, 0.04, "brass", 0.07);
        t.glow.gem(x, 0.26, z, 0.017, 0.035, "aether");
      }
      spinning(t, 0, 0.17, -0.05, [0, 1, 0], 0.4, () => t.body.ring(0, 0.17, -0.05, 0.12, "brass", 0.05));
      return true;
    default: return false;
  }
};
