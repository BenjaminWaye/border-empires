import type { NetworkVariant } from "./network-variants.js";
import { LUXURY_GARDENS } from "./network-site-layouts.js";
import { buildCollapsedGantry, buildShatteredRotor } from "./network-salvage-variants.js";
import type { NetworkResource } from "@border-empires/shared";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

import { luxuryPlant } from "./network-botanical-models.js";
import { buildSalvageField } from "./network-salvage-model.js";
export { luxuryPlant } from "./network-botanical-models.js";
export { salvageRib } from "./network-salvage-model.js";

export const buildNetworkSite = (t: TownBuilders, resource: NetworkResource, variant: NetworkVariant = 0): void => {
  switch (resource) {
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
