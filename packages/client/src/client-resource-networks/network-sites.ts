import { catalystOutcrop } from "./network-geology-model.js";
import type { NetworkResource } from "@border-empires/shared";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

import { luxuryPlant, resinTree } from "./network-botanical-models.js";
import { buildSalvageField } from "./network-salvage-model.js";
export { luxuryPlant, resinTree } from "./network-botanical-models.js";
export { salvageRib } from "./network-salvage-model.js";

export const mineralOutcrop = (t: TownBuilders, x: number, z: number, size: number, catalyst: boolean): void => {
  if (catalyst) { catalystOutcrop(t, x, z, size); return; }
  t.body.ellipsoid(x, size * 0.28, z, size, size * 0.48, size * 0.7, "graphite", 0.4);
  t.body.ellipsoid(x - size * 0.24, size * 0.64, z - size * 0.05, size * 0.66, size * 0.42, size * 0.52, "stoneDark", -0.25);
  for (const offset of [-0.4, 0.12, 0.53]) {
    const vx = x + size * offset;
    t.body.pipe(vx - size * 0.22, size * 0.57, z + size * 0.46, vx, size * 0.88, z + size * 0.2, 0.008, "glassLight");
    t.body.pipe(vx, size * 0.88, z + size * 0.2, vx + size * 0.18, size * 0.77, z - size * 0.25, 0.006, "aether");
  }
};

export const buildNetworkSite = (t: TownBuilders, resource: NetworkResource): void => {
  switch (resource) {
    case "NEURAL_RESIN":
      resinTree(t, 0, 0, 0.34);
      break;
    case "CONDUCTIVE_MINERALS":
    case "CATALYTIC_DEPOSIT":
      for (const [x, z, size] of [[-0.17, 0.07, 0.17], [0.08, -0.04, 0.22], [0.23, 0.19, 0.1], [-0.11, -0.2, 0.09]] as const) mineralOutcrop(t, x, z, size, resource === "CATALYTIC_DEPOSIT");
      break;
    case "LUXURY_BIOTA":
      for (const [x, z, size] of [[-0.21, 0.01, 0.23], [0.02, -0.16, 0.27], [0.22, 0.06, 0.2], [-0.02, 0.2, 0.21]] as const) luxuryPlant(t, x, z, size);
      break;
    case "PRECURSOR_SALVAGE":
      buildSalvageField(t);
      break;
  }
};
