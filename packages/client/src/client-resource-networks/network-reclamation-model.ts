import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { housing, loadingDoor } from "../client-town-district/support-model-detail.js";
import { salvageRib } from "./network-salvage-model.js";

/** A working dismantling yard: incoming wreck, lifting crane, sorted components. */
export const buildReclamationWorks = (t: TownBuilders): void => {
  cuttingCradle(t);
  bridgeCrane(t);
  recoveryWorkshop(t);
  sortingConveyor(t);
};

const cuttingCradle = (t: TownBuilders): void => {
  // Heavy rails and clamps distinguish this organised yard from loose salvage.
  t.body.box(-0.09, 0.01, -0.025, 0.29, 0.025, 0.36, "stoneDark");
  for (const x of [-0.2, 0.02]) {
    t.body.box(x, 0.035, -0.025, 0.018, 0.025, 0.35, "iron");
    for (const z of [-0.13, 0.085]) {
      t.body.box(x, 0.045, z, 0.035, 0.055, 0.04, "brassDark");
      t.body.pipe(x, 0.09, z, x + (x < 0 ? 0.035 : -0.035), 0.11, z, 0.008, "iron");
    }
  }
  // Two severed ceramic hoops, exposed engine and peeled armour panels.
  for (const z of [-0.12, 0.025]) salvageRib(t, -0.09, z, 0.13);
  t.body.box(-0.09, 0.06, -0.045, 0.12, 0.035, 0.23, "ironDark");
  t.body.disc(-0.09, 0.115, 0.075, 0.061, 0.10, "ironDark");
  t.body.disc(-0.09, 0.115, 0.13, 0.027, 0.014, "brass");
  for (const x of [-0.16, -0.02]) {
    t.body.tiltedBox(x, 0.12, -0.06, 0.065, 0.014, 0.22, "plate", 0, x < -0.09 ? -0.55 : 0.55);
    t.body.pipe(x, 0.09, -0.16, x, 0.09, 0.10, 0.008, "brassDark");
  }
  for (const z of [-0.10, -0.06, -0.02]) t.body.box(-0.09, 0.096, z, 0.085, 0.009, 0.012, "iron");
};

const bridgeCrane = (t: TownBuilders): void => {
  // Four legs leave the centre open; bracing follows the sides of the crane.
  for (const x of [-0.255, 0.095]) {
    for (const z of [-0.2, 0.16]) {
      t.body.box(x, 0.015, z, 0.055, 0.025, 0.055, "stoneLight");
      t.body.box(x, 0.04, z, 0.025, 0.35, 0.025, "iron");
      t.body.box(x, 0.065, z + 0.014, 0.012, 0.065, 0.006, "brass");
      t.body.pipe(x, 0.29, z, x, 0.38, z + (z < 0 ? 0.075 : -0.075), 0.008, "iron");
    }
    t.body.box(x, 0.385, -0.02, 0.045, 0.035, 0.43, "iron");
    t.body.box(x, 0.421, -0.02, 0.023, 0.009, 0.43, "brass");
  }
  // Moving double bridge, winch drum and twin lifting cables.
  for (const z of [-0.085, -0.025]) t.body.box(-0.08, 0.433, z, 0.42, 0.033, 0.025, "brassDark");
  t.body.box(-0.07, 0.462, -0.055, 0.09, 0.035, 0.10, "iron");
  t.body.disc(-0.07, 0.48, 0, 0.026, 0.11, "ironDark");
  for (const x of [-0.095, -0.045]) t.body.pipe(x, 0.46, -0.055, x, 0.275, -0.055, 0.003, "ironDark");
  t.body.box(-0.07, 0.265, -0.055, 0.08, 0.018, 0.026, "brass");
  // A lifted armour section makes the crane's job visible at map scale.
  for (const x of [-0.1, -0.04]) t.body.pipe(x, 0.268, -0.055, x, 0.235, -0.055, 0.003, "iron");
  t.body.tiltedBox(-0.07, 0.21, -0.055, 0.14, 0.017, 0.105, "plate", 0.18, -0.24);
  t.body.tiltedBox(-0.07, 0.222, -0.055, 0.095, 0.007, 0.014, "brassDark", 0.18, -0.24);
  // Compact side control station, away from the wreck's silhouette.
  t.body.box(-0.255, 0.19, -0.145, 0.075, 0.10, 0.09, "graphite");
  t.body.box(-0.255, 0.215, -0.096, 0.053, 0.044, 0.005, "glassLight");
  t.body.box(-0.255, 0.29, -0.145, 0.087, 0.012, 0.10, "brassDark");
  for (const x of [-0.25, 0.09]) t.glow.box(x, 0.37, 0.179, 0.026, 0.012, 0.008, "lampWarm");
};

const recoveryWorkshop = (t: TownBuilders): void => {
  housing(t, 0.215, -0.105, 0.13, 0.16, 0.22);
  loadingDoor(t, 0.215, 0.011, 0.075, 0.105);
  t.body.gable(0.215, 0.20, -0.105, 0.15, 0.04, 0.24, "graphite");
  t.body.cylinder(0.25, 0.21, -0.17, 0.016, 0.02, 0.10, "iron", 8);
  t.body.cylinder(0.25, 0.31, -0.17, 0.025, 0.025, 0.012, "brassDark", 8);
};

const sortingConveyor = (t: TownBuilders): void => {
  // A low roller bed connects dismantling to boxed, reusable components.
  t.body.box(0.02, 0.045, 0.225, 0.43, 0.025, 0.085, "ironDark");
  for (const z of [0.18, 0.27]) t.body.box(0.02, 0.06, z, 0.45, 0.012, 0.009, "brassDark");
  for (let i = 0; i < 12; i += 1) {
    const x = -0.18 + i * 0.035;
    t.body.pipe(x, 0.071, 0.19, x, 0.071, 0.26, 0.008, "iron");
  }
  t.body.box(-0.115, 0.08, 0.225, 0.065, 0.025, 0.05, "plate", 0.24);
  t.body.box(-0.015, 0.08, 0.225, 0.055, 0.04, 0.05, "brassDark");
  for (const x of [0.08, 0.19]) {
    t.body.box(x, 0.08, 0.225, 0.064, 0.037, 0.055, "iron");
    t.body.box(x, 0.117, 0.225, 0.05, 0.006, 0.043, "plate");
    t.body.box(x, 0.083, 0.254, 0.016, 0.02, 0.004, "brass");
  }
  for (const x of [-0.17, 0.21]) t.body.box(x, 0.01, 0.225, 0.018, 0.035, 0.06, "iron");
};
