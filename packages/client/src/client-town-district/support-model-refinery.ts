import { beacon, gear, inStep, spinning, steamVent, TOWN_HALO_Y, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate } from "./support-model-core.js";
import { band, gantry, processLine, ribs, vessel } from "./support-model-detail.js";

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
  t.body.pipe(-0.24, 0.085, z, -0.15, 0.05, z, 0.014, "ironDark");
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

/** Circular catwalk with posts and a top rail, hung round a tower at height y. */
const catwalk = (t: TownBuilders, x: number, y: number, z: number, r: number, posts = 8): void => {
  t.body.cylinder(x, y, z, r, r, 0.008, "ironDark", 12);
  t.body.ring(x, y + 0.03, z, r - 0.003, "brass", 0.05);
  for (let i = 0; i < posts; i += 1) {
    const a = (i / posts) * Math.PI * 2;
    t.body.box(x + Math.cos(a) * (r - 0.004), y + 0.008, z + Math.sin(a) * (r - 0.004), 0.004, 0.024, 0.004, "iron");
  }
};

/** Warm light that breathes with its pool on the ground. */
const lit = (t: TownBuilders, x: number, y: number, z: number, w: number, h: number, pool: number): void => {
  inStep(t, t.random(), () => {
    t.glow.box(x, y, z, w, h, 0.004, "lampWarm");
    t.halo.pool(x, TOWN_HALO_Y, z + 0.03, pool, "lampWarm");
  });
};

const titaniumRefinery = (t: TownBuilders): void => {
  // Blast furnace with a diagonal skip incline: the tallest refinery.
  // Upgrade: a lit tap-hole pours molten metal down a channel into an ingot
  // caster, and a catwalk rings the furnace shaft.
  oreIntake(t, -0.08);
  t.body.cylinder(0.04, 0.015, -0.05, 0.11, 0.13, 0.05, "stoneLight", 10);
  t.body.cylinder(0.04, 0.065, -0.05, 0.075, 0.095, 0.2, "iron", 10);
  t.body.cylinder(0.04, 0.265, -0.05, 0.05, 0.075, 0.06, "ironDark", 10);
  t.body.cylinder(0.04, 0.325, -0.05, 0.024, 0.03, 0.1, "graphite", 8);
  for (const y of [0.1, 0.17, 0.24]) band(t, 0.04, y, -0.05, 0.09 - (y - 0.1) * 0.12);
  catwalk(t, 0.04, 0.2, -0.05, 0.1);
  t.body.tiltedBox(-0.1, 0.19, -0.065, 0.3, 0.018, 0.04, "ironDark", 0, Math.atan2(0.2, 0.26));
  t.body.tiltedBox(-0.1, 0.205, -0.065, 0.3, 0.006, 0.05, "brass", 0, Math.atan2(0.2, 0.26));
  for (const side of [-1, 1]) t.body.pipe(0.04 + side * 0.09, 0.05, -0.05, 0.04 + side * 0.13, 0.26, 0.05, 0.009, "brassDark");
  // Tap-hole, molten runner and caster.
  t.body.box(0.04, 0.05, 0.045, 0.05, 0.04, 0.012, "brassDark");
  lit(t, 0.04, 0.058, 0.052, 0.03, 0.024, 0.09);
  t.body.box(0.06, 0.012, 0.11, 0.022, 0.012, 0.11, "stoneDark");
  t.glow.box(0.06, 0.02, 0.11, 0.012, 0.004, 0.105, "lampWarm");
  t.body.box(0.06, 0.012, 0.18, 0.08, 0.022, 0.04, "iron");
  for (const dx of [-0.025, 0, 0.025]) t.glow.box(0.06 + dx, 0.035, 0.18, 0.016, 0.003, 0.026, "lampWarm");
  ingotStack(t, 0.19, 0.12);
  ingotStack(t, 0.19, 0.2);
  processLine(t, -0.1, 0.18, 0.16, "plate");
  steamVent(t, 0.04, 0.425, -0.05, 0.03);
  beacon(t, 0.04, 0.46, -0.05);
};

const umbriteRefinery = (t: TownBuilders): void => {
  // Distillation column flanked by squat sealed vats.
  // Upgrade: two catwalk levels with a ladder and a manifold of pipes give the
  // column structure and scale; a warning beacon caps it.
  oreIntake(t, 0.06);
  t.body.cylinder(0.05, 0.015, -0.03, 0.07, 0.085, 0.03, "stoneLight", 10);
  t.body.cylinder(0.05, 0.045, -0.03, 0.05, 0.055, 0.34, "ironDark", 10);
  for (let i = 0; i < 6; i += 1) band(t, 0.05, 0.08 + i * 0.05, -0.03, 0.058, i % 2 ? "brassDark" : "brass");
  for (let i = 0; i < 3; i += 1) lit(t, 0.05, 0.1 + i * 0.1, 0.022, 0.022, 0.026, 0.05);
  t.body.dome(0.05, 0.385, -0.03, 0.05, "graphite", 10, 0.6);
  catwalk(t, 0.05, 0.16, -0.03, 0.08);
  catwalk(t, 0.05, 0.29, -0.03, 0.075);
  t.body.box(0.12, 0.03, -0.03, 0.022, 0.26, 0.006, "iron");
  for (let i = 0; i < 9; i += 1) t.body.box(0.12, 0.05 + i * 0.028, -0.03, 0.026, 0.004, 0.012, "brassDark");
  for (const [x, z] of [[-0.09, -0.14], [0.19, -0.12]] as const) {
    vessel(t, x, z, 0.055, 0.1, "graphite");
    t.body.pipe(x, 0.15, z, 0.05, 0.2, -0.03, 0.01, "brass");
  }
  // Manifold: three parallel pipes on stands, bent down into the receiver.
  for (const dz of [-0.016, 0, 0.016]) {
    t.body.pipe(0.05, 0.3, -0.03 + dz, 0.18, 0.3, 0.12 + dz, 0.007, dz === 0 ? "brass" : "brassDark");
    t.body.pipe(0.18, 0.3, 0.12 + dz, 0.18, 0.06, 0.12 + dz, 0.007, dz === 0 ? "brass" : "brassDark");
  }
  t.body.box(0.12, 0.015, 0.05, 0.012, 0.28, 0.012, "iron");
  vessel(t, 0.18, 0.12, 0.045, 0.06, "ironDark");
  ribs(t, -0.08, 0.015, 0.14, 0.14, 4, 0.05, 0.07);
  beacon(t, 0.05, 0.43, -0.03);
};

const crystalRefinery = (t: TownBuilders): void => {
  // Glazed lapidary dome over a glowing aether crystal cluster.
  // Upgrade: an octagonal rotunda with buttresses, a ribbed dome and a crystal
  // finial replace the plain box hall, so the silhouette reads from far away.
  oreIntake(t, -0.06);
  t.body.cylinder(0.05, 0.012, 0.0, 0.16, 0.17, 0.02, "stoneLight", 8);
  t.body.cylinder(0.05, 0.032, 0.0, 0.135, 0.14, 0.1, "stone", 8);
  t.body.cylinder(0.05, 0.132, 0.0, 0.145, 0.145, 0.014, "brassDark", 8);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = 0.05 + Math.cos(a) * 0.14, bz = Math.sin(a) * 0.14;
    t.body.box(bx, 0.03, bz, 0.022, 0.11, 0.022, "stoneLight", -a);
    if (i % 2 === 0) lit(t, 0.05 + Math.cos(a + Math.PI / 8) * 0.137, 0.075, Math.sin(a + Math.PI / 8) * 0.137, 0.022, 0.04, 0.05);
  }
  t.body.dome(0.05, 0.146, 0.0, 0.115, "glassLight", 16, 0.85);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    t.body.pipe(0.05 + Math.cos(a) * 0.115, 0.15, Math.sin(a) * 0.115, 0.05, 0.245, 0, 0.005, "brass");
  }
  t.body.ring(0.05, 0.146, 0.0, 0.117, "brass", 0.06);
  t.glow.gem(0.05, 0.16, 0.0, 0.04, 0.12, "aether");
  t.glow.gem(0.01, 0.155, 0.03, 0.022, 0.065, "aether");
  t.glow.gem(0.09, 0.155, -0.025, 0.02, 0.06, "aether");
  t.body.cylinder(0.05, 0.245, 0.0, 0.012, 0.018, 0.02, "brassDark", 8);
  spinning(t, 0.05, 0.3, 0.0, [0, 1, 0], 0.4, () => t.glow.gem(0.05, 0.265, 0.0, 0.016, 0.07, "aether"));
  t.halo.pool(0.05, TOWN_HALO_Y, 0.0, 0.24, "aether");
  crate(t, 0.22, -0.17);
  t.glow.gem(0.22, 0.06, -0.17, 0.012, 0.03, "aether");
};

const titaniumSmelter = (t: TownBuilders): void => {
  // Arc-furnace pot with three electrodes: a squat booster beside the refinery.
  // Upgrade: a spinning drive wheel and transformer coils feed the electrodes
  // through hanging cables, and the pot mouth glows.
  t.body.cylinder(0, 0.015, 0, 0.12, 0.13, 0.03, "stoneLight", 10);
  t.body.cylinder(0, 0.045, 0, 0.1, 0.09, 0.11, "iron", 10);
  band(t, 0, 0.12, 0, 0.105);
  t.body.cylinder(0, 0.155, 0, 0.105, 0.105, 0.016, "graphite", 10);
  inStep(t, t.random(), () => t.glow.ring(0, 0.172, 0, 0.06, "lampWarm", 0.12));
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * 0.045, z = Math.sin(a) * 0.045;
    t.body.cylinder(x, 0.17, z, 0.012, 0.012, 0.16, "plate", 8);
    band(t, x, 0.3, z, 0.016, "brassDark");
    t.body.pipe(x, 0.31, z, -0.2, 0.2, -0.13 + i * 0.03, 0.004, "ironDark");
  }
  gantry(t, 0, 0, 0.3, 0.27, 0.05);
  gear(t, 0.15, 0.29, 0.03, 0.04, 0, 1.2);
  // Transformer: two coiled drums on a plinth.
  t.body.box(-0.2, 0.012, -0.1, 0.1, 0.03, 0.12, "stoneDark");
  for (const dz of [-0.03, 0.03]) {
    t.body.cylinder(-0.2, 0.042, -0.1 + dz, 0.028, 0.028, 0.14, "ironDark", 10);
    for (let k = 0; k < 5; k += 1) band(t, -0.2, 0.055 + k * 0.024, -0.1 + dz, 0.031, "brass");
  }
  lit(t, 0, 0.07, 0.092, 0.06, 0.03, 0.08);
  t.body.tiltedBox(0.17, 0.06, 0.1, 0.08, 0.035, 0.05, "brassDark", 0, -0.35);
  ingotStack(t, -0.06, 0.17);
};

const umbriteDistillery = (t: TownBuilders): void => {
  // Waisted cooling tower with a steam plume.
  // Upgrade: a smooth hyperbolic shell built from many thin slices, with
  // weathering bands and a pump house, instead of two stacked cones.
  t.body.cylinder(0, 0.015, 0, 0.13, 0.14, 0.025, "stoneLight", 14);
  const slices = 12, h = 0.25, base = 0.04;
  for (let i = 0; i < slices; i += 1) {
    const r = (u: number): number => 0.072 + 0.04 * Math.pow((u - 0.62) / 0.62, 2);
    const u0 = i / slices, u1 = (i + 1) / slices;
    t.body.cylinder(0, base + u0 * h, 0, r(u1), r(u0), h / slices + 0.001, i === 3 || i === 8 ? "stoneDark" : "stone", 16);
  }
  t.body.ring(0, base + h, 0, 0.09, "brassDark", 0.08);
  for (const a of [0, 1, 2, 3, 4, 5]) {
    const ang = (a / 6) * Math.PI * 2;
    t.body.box(Math.cos(ang) * 0.11, 0.015, Math.sin(ang) * 0.11, 0.016, 0.04, 0.016, "stoneLight", -ang);
  }
  for (let i = 0; i < 3; i += 1) steamVent(t, -0.03 + i * 0.03, 0.27, (i - 1) * 0.02, 0.03);
  // Pump house feeding the tower.
  t.body.box(-0.19, 0.015, 0.12, 0.09, 0.07, 0.07, "stone");
  t.body.gable(-0.19, 0.085, 0.12, 0.1, 0.035, 0.08, "graphite");
  lit(t, -0.19, 0.05, 0.157, 0.03, 0.025, 0.06);
  t.body.pipe(-0.145, 0.05, 0.11, -0.08, 0.06, 0.06, 0.012, "brass");
  vessel(t, -0.2, -0.1, 0.035, 0.07, "ironDark");
  t.body.pipe(-0.2, 0.1, -0.1, -0.09, 0.08, -0.05, 0.009, "brassDark");
  lit(t, 0, 0.05, 0.11, 0.04, 0.03, 0.07);
};

const crystalCutter = (t: TownBuilders): void => {
  // Cutting bench with a big upright wheel and finished stones.
  // Upgrade: a motor drives the wheel through a belt, work lamps light the
  // bench, and cut stones are sorted into tiered trays by size.
  t.body.box(0, 0.012, 0.03, 0.34, 0.02, 0.2, "stoneLight");
  t.body.box(0, 0.032, 0.03, 0.31, 0.055, 0.17, "stone");
  t.body.box(0, 0.087, 0.03, 0.32, 0.01, 0.18, "brassDark");
  for (const x of [-0.06, 0.06]) t.body.box(x, 0.097, -0.06, 0.02, 0.17, 0.03, "iron");
  t.body.pipe(-0.07, 0.24, -0.06, 0.07, 0.24, -0.06, 0.01, "brassDark");
  gear(t, 0, 0.24, -0.06, 0.11, Math.PI / 2, 0.8);
  t.body.disc(0, 0.24, -0.06, 0.02, 0.03, "brassDark", Math.PI / 2);
  // Motor and belt.
  t.body.cylinder(0.17, 0.097, -0.06, 0.035, 0.035, 0.06, "ironDark", 10);
  band(t, 0.17, 0.13, -0.06, 0.038, "brass");
  gear(t, 0.17, 0.18, -0.06, 0.03, Math.PI / 2, 2.4);
  t.body.pipe(0.17, 0.21, -0.06, 0.01, 0.35, -0.06, 0.004, "ironDark");
  t.body.pipe(0.17, 0.15, -0.06, 0.01, 0.13, -0.06, 0.004, "ironDark");
  // Tiered trays of sorted stones.
  for (let tier = 0; tier < 3; tier += 1) {
    const y = 0.1 + tier * 0.025, z = 0.12 - tier * 0.03;
    t.body.box(-0.03, y, z, 0.24, 0.008, 0.026, "brassDark");
    for (let k = 0; k < 4 - tier; k += 1) {
      t.glow.gem(-0.12 + k * 0.06 + tier * 0.03, y + 0.01, z, 0.008 + tier * 0.004, 0.02 + tier * 0.008, "aether");
    }
  }
  for (const x of [-0.13, 0.08]) {
    t.body.pipe(x, 0.097, -0.01, x, 0.19, 0.05, 0.004, "iron");
    lit(t, x, 0.185, 0.05, 0.016, 0.01, 0.06);
  }
  t.halo.pool(0, TOWN_HALO_Y, 0.1, 0.15, "aether");
  crate(t, 0.2, -0.16);
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
