import { buildConductiveField, conductiveOutcrop } from "./network-conductive-model.js";
import { catalystOutcrop } from "./network-geology-model.js";
import type { NetworkResource } from "@border-empires/shared";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

import { luxuryPlant, resinTree } from "./network-botanical-models.js";
import { buildSalvageField } from "./network-salvage-model.js";
export { luxuryPlant, resinTree } from "./network-botanical-models.js";
export { salvageRib } from "./network-salvage-model.js";

export const mineralOutcrop = (t: TownBuilders, x: number, z: number, size: number, catalyst: boolean): void => {
  if (catalyst) { catalystOutcrop(t, x, z, size); return; }
  conductiveOutcrop(t, x, z, size);
};

export const buildNetworkSite = (t: TownBuilders, resource: NetworkResource): void => {
  switch (resource) {
    case "NEURAL_RESIN":
      resinTree(t, 0, 0, 0.34);
      break;
    case "CONDUCTIVE_MINERALS":
      buildConductiveField(t);
      break;
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
