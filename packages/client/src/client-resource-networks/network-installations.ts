import type { NetworkResource } from "@border-empires/shared";
import { octagonPlate, lampPost, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { housing } from "../client-town-district/support-model-detail.js";
import { luxuryPlant } from "./network-sites.js";

import { buildReclamationWorks } from "./network-reclamation-model.js";

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

export const buildNetworkInstallation = (t: TownBuilders, resource: NetworkResource): void => {
  foundation(t);
  switch (resource) {
    case "LUXURY_BIOTA": cultivationEstate(t); break;
    case "PRECURSOR_SALVAGE": buildReclamationWorks(t); break;
  }
};
