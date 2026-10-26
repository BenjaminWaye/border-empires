import type { NetworkResource } from "@border-empires/shared";
import { gear, octagonPlate, lampPost, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { crate, windowStrip } from "../client-town-district/support-model-core.js";
import { band, gantry, housing, loadingDoor, ribs, vessel } from "../client-town-district/support-model-detail.js";
import { luxuryPlant, mineralOutcrop, resinTree, salvageRib } from "./network-sites.js";

const foundation = (t: TownBuilders): void => {
  octagonPlate(t, 0.39, false);
  for (const side of [-1, 1]) {
    lampPost(t, side * 0.29, 0.2, 0.095);
    for (const z of [-0.18, 0.18]) {
      t.body.box(side * 0.3, 0.008, z, 0.03, 0.065, 0.03, "iron");
      t.body.box(side * 0.3, 0.073, z, 0.041, 0.01, 0.041, "brass");
    }
    t.body.pipe(side * 0.3, 0.065, -0.18, side * 0.3, 0.065, 0.18, 0.004, "brassDark");
  }
  t.body.box(0, -0.003, 0.28, 0.15, 0.012, 0.1, "paving");
};

const resinExtractor = (t: TownBuilders): void => {
  resinTree(t, -0.16, -0.06, 0.43);
  resinTree(t, 0.08, -0.17, 0.32);
  vessel(t, 0.15, 0.09, 0.075, 0.19);
  // Split brass collars tap living trunks; pipes feed the collection vessel.
  for (const [x, z, h] of [[-0.16, -0.06, 0.14], [0.08, -0.17, 0.12]] as const) {
    band(t, x, h, z, 0.038);
    t.body.pipe(x, h, z + 0.025, x, 0.07, z + 0.09, 0.009, "brass");
    t.body.pipe(x, 0.07, z + 0.09, 0.15, 0.07, 0.09, 0.009, "brassDark");
  }
  t.body.box(0.15, 0.08, 0.164, 0.03, 0.1, 0.01, "window");
  t.glow.box(0.15, 0.084, 0.171, 0.018, 0.082, 0.005, "lampWarm");
  housing(t, -0.14, 0.17, 0.16, 0.085, 0.09);
  gear(t, -0.14, 0.095, 0.225, 0.031, 0, 0.35);
  for (const x of [-0.04, 0.035]) {
    t.body.cylinder(x, 0.01, 0.23, 0.023, 0.027, 0.064, "iron", 8);
    band(t, x, 0.056, 0.23, 0.025);
    t.body.dome(x, 0.074, 0.23, 0.023, "brass", 8, 0.45);
  }
};

const implantFoundry = (t: TownBuilders): void => {
  housing(t, -0.08, -0.12, 0.3, 0.2, 0.22);
  t.body.gable(-0.08, 0.25, -0.12, 0.33, 0.065, 0.25, "graphite");
  windowStrip(t, -0.08, 0.15, 0, 4);
  t.body.cylinder(-0.16, 0.28, -0.18, 0.018, 0.023, 0.17, "iron", 8);
  band(t, -0.16, 0.44, -0.18, 0.028);
  // Open fine-component bench, press head and conductive feedstock hopper.
  gantry(t, 0.035, 0.13, 0.29, 0.22, 0.035);
  t.body.box(0.035, 0.025, 0.13, 0.26, 0.045, 0.13, "ironDark");
  t.body.box(0.035, 0.07, 0.13, 0.23, 0.009, 0.11, "stoneLight");
  for (const x of [-0.04, 0.035, 0.11]) {
    t.body.pipe(x, 0.25, 0.13, x, 0.16, 0.13, 0.008, "brass");
    t.body.box(x, 0.145, 0.13, 0.035, 0.018, 0.035, "iron");
    t.glow.box(x, 0.082, 0.13, 0.025, 0.006, 0.03, "aether");
  }
  mineralOutcrop(t, 0.22, -0.12, 0.09, false);
  t.body.box(0.23, 0.01, -0.12, 0.12, 0.05, 0.14, "iron");
  ribs(t, -0.16, 0.023, 0.24, 0.14, 5, 0.025, 0.04);
  crate(t, 0.2, 0.23);
};

const catalystRefinery = (t: TownBuilders): void => {
  for (const [x, z, h] of [[-0.12, -0.1, 0.39], [0.11, -0.03, 0.27]] as const) {
    vessel(t, x, z, 0.066, h);
    for (const y of [0.11, 0.2, h + 0.01]) band(t, x, y, z, 0.073);
    t.body.pipe(x + 0.045, 0.09, z + 0.05, x + 0.045, h + 0.06, z + 0.05, 0.006, "brass");
    t.body.box(x, 0.1, z + 0.065, 0.02, h * 0.54, 0.008, "glassLight");
  }
  t.body.pipe(-0.12, 0.32, -0.1, 0.11, 0.32, -0.03, 0.013, "brass");
  t.body.pipe(0.11, 0.32, -0.03, 0.11, 0.24, -0.03, 0.013, "brass");
  housing(t, -0.08, 0.16, 0.21, 0.1, 0.1);
  mineralOutcrop(t, 0.2, 0.19, 0.08, true);
  t.body.box(0.2, 0.006, 0.18, 0.13, 0.022, 0.15, "ironDark");
  gear(t, -0.08, 0.105, 0.215, 0.027, 0, 0.25);
  for (const x of [-0.23, -0.2]) t.body.pipe(x, 0.025, -0.16, x, 0.34, -0.16, 0.004, "brassDark");
  for (let i = 0; i < 6; i += 1) t.body.box(-0.215, 0.05 + i * 0.045, -0.16, 0.035, 0.006, 0.008, "brass");
};

const cultivationEstate = (t: TownBuilders): void => {
  // Two open conservatory bays keep the actual plants visible from the map.
  for (const x of [-0.14, 0.11]) {
    t.body.box(x, 0.008, -0.03, 0.19, 0.038, 0.37, "stoneLight");
    t.body.box(x, 0.046, -0.03, 0.16, 0.008, 0.33, "trunk");
    for (const z of [-0.13, 0, 0.12]) luxuryPlant(t, x, z, 0.16);
    for (const side of [-1, 1]) {
      t.body.box(x + side * 0.1, 0.03, -0.03, 0.009, 0.23, 0.38, "glass");
      t.body.pipe(x + side * 0.1, 0.045, -0.22, x + side * 0.1, 0.27, -0.22, 0.007, "brass");
      t.body.pipe(x + side * 0.1, 0.27, -0.22, x, 0.34, -0.22, 0.007, "brass");
      t.body.pipe(x + side * 0.1, 0.27, 0.16, x, 0.34, 0.16, 0.007, "brass");
      t.body.pipe(x + side * 0.1, 0.27, -0.22, x + side * 0.1, 0.27, 0.16, 0.006, "brassDark");
      t.body.tiltedBox(x + side * 0.05, 0.305, -0.03, 0.122, 0.004, 0.38, "glass", 0, -side * Math.atan(0.7));
    }
    t.body.pipe(x, 0.34, -0.22, x, 0.34, 0.16, 0.007, "brass");
  }
  housing(t, 0, 0.235, 0.2, 0.08, 0.07);
  for (const x of [-0.2, 0.2]) {
    t.body.cylinder(x, 0.01, 0.23, 0.025, 0.027, 0.055, "iron", 8);
    t.body.dome(x, 0.065, 0.23, 0.025, "brass", 8, 0.5);
  }
};

const reclamationWorks = (t: TownBuilders): void => {
  salvageRib(t, -0.05, 0.03, 0.21);
  gantry(t, 0, -0.08, 0.46, 0.43, 0.055);
  for (const z of [-0.15, 0]) t.body.box(0, 0.455, z, 0.49, 0.018, 0.015, "brassDark");
  t.body.box(-0.07, 0.465, -0.08, 0.1, 0.035, 0.1, "iron");
  t.body.pipe(-0.07, 0.47, -0.08, -0.07, 0.25, -0.08, 0.004, "ironDark");
  t.body.pipe(-0.07, 0.25, -0.08, -0.035, 0.22, -0.08, 0.007, "brass");
  housing(t, 0.18, 0.17, 0.12, 0.14, 0.14);
  loadingDoor(t, 0.18, 0.246, 0.06, 0.09);
  // Sorting beds show recovered components; three lamps mark the work area.
  t.body.box(-0.14, 0.008, 0.22, 0.21, 0.025, 0.09, "ironDark");
  for (const x of [-0.21, -0.14, -0.07]) {
    t.body.box(x, 0.035, 0.22, 0.042, 0.022, 0.05, "stoneLight");
    t.body.box(x, 0.057, 0.22, 0.027, 0.008, 0.032, "brassDark");
  }
  crate(t, -0.23, -0.18);
};

export const buildNetworkInstallation = (t: TownBuilders, resource: NetworkResource): void => {
  foundation(t);
  switch (resource) {
    case "NEURAL_RESIN": resinExtractor(t); break;
    case "CONDUCTIVE_MINERALS": implantFoundry(t); break;
    case "CATALYTIC_DEPOSIT": catalystRefinery(t); break;
    case "LUXURY_BIOTA": cultivationEstate(t); break;
    case "PRECURSOR_SALVAGE": reclamationWorks(t); break;
  }
};
