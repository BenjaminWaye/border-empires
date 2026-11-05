import { gear, steamVent, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { condenser, crate, manufactory } from "./support-model-core.js";
import { band, gantry, housing, loadingDoor, processLine, ribs, vessel } from "./support-model-detail.js";
import { buildCivic } from "./support-model-civic.js";
import { buildManpower } from "./support-model-manpower.js";

const titaniumWorks = (t: TownBuilders, upgraded: boolean): void => {
  // Open rolling mill: low horizontal mass, three sawtooth roof bays.
  housing(t, -0.035, -0.1, 0.38, 0.12, 0.18);
  for (const x of [-0.16, -0.035, 0.09]) {
    t.body.gable(x, 0.18, -0.1, 0.115, 0.055, 0.2, "graphite");
    t.body.box(x, 0.181, -0.002, 0.09, 0.038, 0.006, "glassLight");
  }
  processLine(t, -0.04, 0.15, 0.36);
  for (const x of [-0.13, 0.06]) {
    t.body.box(x, 0.06, 0.13, 0.02, 0.1, 0.13, "iron");
    t.body.pipe(x, 0.115, 0.08, x, 0.115, 0.19, 0.025, "brass");
  }
  if (upgraded) {
    gantry(t, 0, 0.05, 0.41, 0.32, 0.045);
    t.body.box(0.06, 0.31, 0.05, 0.1, 0.07, 0.07, "brassDark");
    ribs(t, 0.2, 0.025, -0.13, 0.08, 4, 0.16, 0.1);
  } else {
    t.body.cylinder(-0.22, 0.04, -0.16, 0.018, 0.025, 0.26, "iron", 8);
    band(t, -0.22, 0.29, -0.16, 0.028);
  }
};

const umbriteWorks = (t: TownBuilders, upgraded: boolean): void => {
  // Sealed retort: a tall tapered furnace with a shielded feed intake.
  t.body.cylinder(0.045, 0.015, -0.065, 0.12, 0.155, 0.04, "stoneLight", 8);
  t.body.cylinder(0.045, 0.055, -0.065, 0.075, 0.12, 0.24, "ironDark", 8);
  t.body.cone(0.045, 0.295, -0.065, 0.092, 0.1, "graphite", 8);
  for (const y of [0.07, 0.18, 0.285]) band(t, 0.045, y, -0.065, y > 0.2 ? 0.085 : y > 0.1 ? 0.105 : 0.125);
  for (const side of [-1, 1]) t.body.box(0.045 + side * 0.11, 0.04, -0.065, 0.025, 0.22, 0.065, "stoneDark");
  t.body.box(0.045, 0.065, 0.052, 0.075, 0.085, 0.015, "brassDark");
  t.glow.box(0.045, 0.075, 0.062, 0.05, 0.055, 0.005, "lampWarm");
  processLine(t, -0.05, 0.18, 0.31, "ironDark");
  ribs(t, -0.17, 0.015, -0.065, 0.09, 4, 0.13, 0.19);
  if (upgraded) {
    for (const x of [-0.16, 0.21]) {
      t.body.cylinder(x, 0.02, -0.16, 0.035, 0.045, 0.32, "iron", 8);
      band(t, x, 0.29, -0.16, 0.045);
      t.body.pipe(x, 0.25, -0.16, 0.045, 0.25, -0.065, 0.012, "brass");
    }
    t.body.box(0.045, 0.39, -0.065, 0.055, 0.035, 0.055, "brass");
  } else steamVent(t, 0.045, 0.39, -0.065, 0.055);
};

const weapons = (t: TownBuilders, kind: string): void => {
  if (kind === "WEAPONS_WORKSHOP") {
    housing(t, -0.08, -0.08, 0.25, 0.1, 0.23);
    t.body.gable(-0.08, 0.153, -0.08, 0.28, 0.065, 0.25, "graphite");
    loadingDoor(t, -0.08, 0.045, 0.1, 0.095);
    t.body.box(0.13, 0.025, 0.13, 0.13, 0.06, 0.09, "iron");
    t.body.box(0.13, 0.085, 0.13, 0.075, 0.035, 0.06, "brassDark");
    gear(t, 0.16, 0.18, -0.06, 0.065, 0, 0.4);
    steamVent(t, -0.16, 0.2, -0.13, 0.12);
    crate(t, -0.19, 0.17);
    return;
  }
  if (kind === "TITANIUM_WEAPONS_FACTORY") {
    // Forging press with an unmistakable open rectangular crown.
    housing(t, 0, -0.15, 0.36, 0.11, 0.1);
    gantry(t, 0, 0.045, 0.27, 0.34, 0.14);
    t.body.box(0, 0.22, 0.045, 0.115, 0.08, 0.08, "brassDark");
    t.body.box(0, 0.11, 0.045, 0.075, 0.11, 0.065, "iron");
    t.glow.box(0, 0.14, 0.08, 0.04, 0.045, 0.004, "aether");
    t.body.box(0, 0.04, 0.045, 0.14, 0.04, 0.14, "stoneLight");
    for (const x of [-0.22, 0.22]) ribs(t, x, 0.025, 0.02, 0.065, 3, 0.15, 0.12);
    processLine(t, 0, 0.2, 0.28);
  } else {
    // Armoured crucible and forked containment pylons, never a press repaint.
    vessel(t, 0, -0.04, 0.11, 0.22, "ironDark");
    for (const x of [-0.2, 0.2]) {
      t.body.box(x, 0.025, -0.04, 0.055, 0.31, 0.12, "iron");
      t.body.pipe(x, 0.32, -0.04, x * 0.5, 0.37, -0.04, 0.017, "brassDark");
      t.glow.box(x, 0.09, 0.025, 0.014, 0.2, 0.004, "lampWarm");
    }
    t.body.box(0, 0.025, 0.17, 0.19, 0.045, 0.1, "brassDark");
    for (const x of [-0.06, 0, 0.06]) t.body.gem(x, 0.09, 0.17, 0.022, 0.055, "ironDark");
  }
};

export const buildIndustry = (t: TownBuilders, kind: string): boolean => {
  if (buildCivic(t, kind) || buildManpower(t, kind)) return true;
  switch (kind) {
    case "MANUFACTORY": manufactory(t); return true;
    case "TITANIUM_WORKS": case "HIGH_YIELD_TITANIUM_WORKS": titaniumWorks(t, kind.startsWith("HIGH_YIELD")); return true;
    case "UMBRITE_WORKS": case "HIGH_YIELD_UMBRITE_WORKS": umbriteWorks(t, kind.startsWith("HIGH_YIELD")); return true;
    case "TITANIUM_WEAPONS_FACTORY": case "UMBRITE_WEAPONS_FACTORY": case "WEAPONS_WORKSHOP": weapons(t, kind); return true;
    case "AETHER_CONDENSER": case "HIGH_YIELD_AETHER_CONDENSER":
      condenser(t);
      if (kind.startsWith("HIGH_YIELD")) {
        // Elevated rectangular condenser bridge creates a different skyline.
        gantry(t, 0, -0.08, 0.43, 0.42, 0.045);
        ribs(t, 0, 0.44, -0.08, 0.3, 7, 0.035, 0.07);
      }
      return true;
    default: return false;
  }
};
