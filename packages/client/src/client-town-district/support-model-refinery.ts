import { gear, steamVent, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate } from "./support-model-core.js";
import { band, gantry, housing, processLine, ribs, vessel } from "./support-model-detail.js";

// Refineries process one linked deposit field; boosters add output to the
// refineries of their resource in the same town (docs/territory-development-plan.md).
// Every refinery shares an ore intake on its -x side (where the supply line
// arrives) so the family reads as one; each resource keeps its own landmark.

export const REFINERY_MODEL_KINDS = [
  "TITANIUM_REFINERY", "UMBRITE_REFINERY", "CRYSTAL_REFINERY",
  "TITANIUM_SMELTER", "UMBRITE_DISTILLERY", "CRYSTAL_CUTTER"
] as const;
export type RefineryModelKind = typeof REFINERY_MODEL_KINDS[number];

const oreIntake = (t: TownBuilders, z: number): void => {
  // Receiving hopper on short legs, fed from the field side.
  for (const dx of [-0.035, 0.035]) for (const dz of [-0.035, 0.035]) {
    t.body.box(-0.24 + dx, 0.01, z + dz, 0.012, 0.1, 0.012, "iron");
  }
  t.body.cylinder(-0.24, 0.08, z, 0.06, 0.018, 0.075, "iron", 8);
  band(t, -0.24, 0.15, z, 0.062, "brass");
  t.body.blob(-0.24, 0.155, z, 0.045, "stoneDark", 0.45);
  t.body.pipe(-0.24, 0.085, z, -0.15, 0.05, z, 0.014, "brassDark");
  t.body.box(-0.24, 0.005, z, 0.09, 0.012, 0.09, "stoneDark");
};

const ingotStack = (t: TownBuilders, x: number, z: number): void => {
  for (let layer = 0; layer < 3; layer += 1) {
    for (const dx of [-0.017, 0.017]) {
      const turned = layer % 2 === 1;
      t.body.box(x + (turned ? 0 : dx), 0.01 + layer * 0.014, z + (turned ? dx : 0), turned ? 0.06 : 0.026, 0.012, turned ? 0.026 : 0.06, "plate");
    }
  }
};

const titaniumRefinery = (t: TownBuilders): void => {
  // Blast furnace with a diagonal skip incline: the tallest refinery.
  oreIntake(t, -0.08);
  t.body.cylinder(0.04, 0.015, -0.05, 0.11, 0.13, 0.05, "stoneLight", 10);
  t.body.cylinder(0.04, 0.065, -0.05, 0.075, 0.095, 0.2, "iron", 10);
  t.body.cylinder(0.04, 0.265, -0.05, 0.05, 0.075, 0.06, "ironDark", 10);
  t.body.cylinder(0.04, 0.325, -0.05, 0.024, 0.03, 0.1, "graphite", 8);
  for (const y of [0.1, 0.17, 0.24]) band(t, 0.04, y, -0.05, 0.09 - (y - 0.1) * 0.12);
  t.glow.box(0.04, 0.08, 0.04, 0.05, 0.035, 0.004, "lampWarm");
  t.body.tiltedBox(-0.1, 0.19, -0.065, 0.3, 0.018, 0.04, "ironDark", 0, Math.atan2(0.2, 0.26));
  t.body.tiltedBox(-0.1, 0.205, -0.065, 0.3, 0.006, 0.05, "brass", 0, Math.atan2(0.2, 0.26));
  for (const side of [-1, 1]) t.body.pipe(0.04 + side * 0.09, 0.05, -0.05, 0.04 + side * 0.13, 0.26, 0.05, 0.009, "brassDark");
  ingotStack(t, 0.17, 0.13);
  ingotStack(t, 0.09, 0.17);
  processLine(t, -0.05, 0.15, 0.2, "plate");
  steamVent(t, 0.04, 0.425, -0.05, 0.03);
};

const umbriteRefinery = (t: TownBuilders): void => {
  // Distillation column flanked by squat sealed vats.
  oreIntake(t, 0.06);
  t.body.cylinder(0.05, 0.015, -0.03, 0.07, 0.085, 0.03, "stoneLight", 10);
  t.body.cylinder(0.05, 0.045, -0.03, 0.05, 0.055, 0.34, "ironDark", 10);
  for (let i = 0; i < 6; i += 1) band(t, 0.05, 0.08 + i * 0.05, -0.03, 0.058, i % 2 ? "brassDark" : "brass");
  for (let i = 0; i < 3; i += 1) t.glow.box(0.05, 0.1 + i * 0.1, 0.022, 0.022, 0.026, 0.004, "lampWarm");
  t.body.dome(0.05, 0.385, -0.03, 0.05, "graphite", 10, 0.6);
  for (const [x, z] of [[-0.09, -0.14], [0.19, -0.12]] as const) {
    vessel(t, x, z, 0.055, 0.1, "graphite");
    t.body.pipe(x, 0.15, z, 0.05, 0.2, -0.03, 0.01, "brass");
  }
  t.body.pipe(0.05, 0.3, -0.03, 0.18, 0.3, 0.12, 0.01, "brassDark");
  t.body.pipe(0.18, 0.3, 0.12, 0.18, 0.04, 0.12, 0.01, "brassDark");
  vessel(t, 0.18, 0.12, 0.04, 0.06, "ironDark");
  ribs(t, -0.08, 0.015, 0.14, 0.14, 4, 0.05, 0.07);
};

const crystalRefinery = (t: TownBuilders): void => {
  // Glazed lapidary dome over a glowing aether crystal cluster.
  oreIntake(t, -0.06);
  housing(t, 0.04, 0.0, 0.3, 0.09, 0.26);
  t.body.cylinder(0.04, 0.14, 0.0, 0.11, 0.115, 0.014, "brassDark", 12);
  t.body.dome(0.04, 0.154, 0.0, 0.1, "glassLight", 12, 0.85);
  t.body.ring(0.04, 0.2, 0.0, 0.1, "brass", 0.06);
  t.glow.gem(0.04, 0.165, 0.0, 0.035, 0.11, "aether");
  t.glow.gem(0.0, 0.16, 0.025, 0.02, 0.06, "aether");
  t.glow.gem(0.08, 0.16, -0.02, 0.018, 0.055, "aether");
  t.halo.pool(0.04, 0.02, 0.0, 0.22, "aether");
  for (const x of [-0.08, 0.16]) {
    t.body.box(x, 0.13, 0.11, 0.03, 0.05, 0.03, "iron");
    t.body.cone(x, 0.18, 0.11, 0.022, 0.04, "graphite", 6);
  }
  crate(t, 0.2, -0.16);
  t.glow.gem(0.2, 0.06, -0.16, 0.012, 0.03, "aether");
};

const titaniumSmelter = (t: TownBuilders): void => {
  // Arc-furnace pot with three electrodes: a squat booster beside the refinery.
  t.body.cylinder(0, 0.015, 0, 0.12, 0.13, 0.03, "stoneLight", 10);
  t.body.cylinder(0, 0.045, 0, 0.1, 0.09, 0.11, "iron", 10);
  band(t, 0, 0.12, 0, 0.105);
  t.body.cylinder(0, 0.155, 0, 0.105, 0.105, 0.016, "graphite", 10);
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * 0.045, z = Math.sin(a) * 0.045;
    t.body.cylinder(x, 0.17, z, 0.012, 0.012, 0.16, "plate", 8);
    band(t, x, 0.3, z, 0.016, "brassDark");
  }
  gantry(t, 0, 0, 0.3, 0.27, 0.05);
  t.glow.box(0, 0.07, 0.092, 0.06, 0.03, 0.004, "lampWarm");
  t.body.tiltedBox(0.17, 0.06, 0.1, 0.08, 0.035, 0.05, "brassDark", 0, -0.35);
  ingotStack(t, -0.17, 0.12);
};

const umbriteDistillery = (t: TownBuilders): void => {
  // Waisted cooling tower with a steam plume.
  t.body.cylinder(0, 0.015, 0, 0.13, 0.14, 0.025, "stoneLight", 12);
  t.body.cylinder(0, 0.04, 0, 0.075, 0.11, 0.14, "stone", 12);
  t.body.cylinder(0, 0.18, 0, 0.09, 0.075, 0.11, "stone", 12);
  t.body.ring(0, 0.29, 0, 0.09, "brassDark", 0.08);
  for (const y of [0.07, 0.18]) band(t, 0, y, 0, y > 0.1 ? 0.078 : 0.105, "ironDark");
  for (let i = 0; i < 3; i += 1) steamVent(t, -0.03 + i * 0.03, 0.27, (i - 1) * 0.02, 0.03);
  t.body.pipe(-0.19, 0.04, 0.1, -0.08, 0.1, 0.05, 0.012, "brass");
  vessel(t, -0.19, 0.1, 0.035, 0.07, "ironDark");
  t.glow.box(0, 0.05, 0.105, 0.04, 0.03, 0.004, "lampWarm");
};

const crystalCutter = (t: TownBuilders): void => {
  // Cutting bench with a big upright wheel and finished stones.
  housing(t, 0, 0.03, 0.3, 0.07, 0.16);
  for (const x of [-0.06, 0.06]) t.body.box(x, 0.1, -0.06, 0.02, 0.17, 0.03, "iron");
  t.body.pipe(-0.07, 0.24, -0.06, 0.07, 0.24, -0.06, 0.01, "brassDark");
  gear(t, 0, 0.24, -0.06, 0.11, Math.PI / 2, 0.8);
  t.body.disc(0, 0.24, -0.06, 0.02, 0.03, "brassDark", Math.PI / 2);
  t.body.box(0, 0.12, 0.09, 0.22, 0.02, 0.08, "brassDark");
  for (const x of [-0.07, 0, 0.07]) t.glow.gem(x, 0.14, 0.09, 0.015, 0.035, "aether");
  t.halo.pool(0, 0.02, 0.09, 0.15, "aether");
  crate(t, 0.2, -0.13);
};

export const buildRefinery = (t: TownBuilders, kind: string): boolean => {
  switch (kind) {
    case "TITANIUM_REFINERY": titaniumRefinery(t); return true;
    case "UMBRITE_REFINERY": umbriteRefinery(t); return true;
    case "CRYSTAL_REFINERY": crystalRefinery(t); return true;
    case "TITANIUM_SMELTER": titaniumSmelter(t); return true;
    case "UMBRITE_DISTILLERY": umbriteDistillery(t); return true;
    case "CRYSTAL_CUTTER": crystalCutter(t); return true;
    default: return false;
  }
};
