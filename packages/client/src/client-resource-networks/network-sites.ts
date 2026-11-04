import type { NetworkVariant } from "./network-variants.js";
import { RESIN_GROVES, CATALYST_FIELDS, LUXURY_GARDENS } from "./network-site-layouts.js";
import { buildCollapsedGantry, buildShatteredRotor } from "./network-salvage-variants.js";
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

export const buildNetworkSite = (t: TownBuilders, resource: NetworkResource, variant: NetworkVariant = 0): void => {
  switch (resource) {
    case "NEURAL_RESIN":
      for (const [x,z,height] of RESIN_GROVES[variant]) resinTree(t,x,z,height);
      break;
    case "CONDUCTIVE_MINERALS":
      buildConductiveField(t,variant);
      break;
    case "CATALYTIC_DEPOSIT":
      for (const [x, z, size] of CATALYST_FIELDS[variant]) catalystOutcrop(t, x, z, size, variant);
      break;
    case "LUXURY_BIOTA":
      for (const [x, z, size] of LUXURY_GARDENS[variant]) luxuryPlant(t, x, z, size);
      break;
    case "PRECURSOR_SALVAGE":
      if (variant === 1) buildCollapsedGantry(t);
      else if (variant === 2) buildShatteredRotor(t);
      else buildSalvageField(t);
      break;
  }
};
