import type { LandBiome } from "../types.js";
import type { NetworkResource } from "./resource-networks.js";

export type NetworkBiomeContext = {
  readonly biome: LandBiome | undefined;
  readonly forest: boolean;
  readonly hills: boolean;
  readonly tropical: boolean;
  readonly nearMountains: boolean;
};

/** Preferred habitat first; secondary habitat keeps smaller island maps viable. */
export const networkBiomePriority = (resource: NetworkResource, context: NetworkBiomeContext): 0 | 1 | undefined => {
  const { biome, hills, tropical, nearMountains } = context;
  const grass = biome === "GRASS" || biome === "GRASSLAND" || biome === "PLAINS" || biome === "JUNGLE" || biome === "MARSH";
  switch (resource) {
    case "LUXURY_BIOTA": return grass ? tropical || biome === "MARSH" ? 0 : 1 : undefined;
    case "PRECURSOR_SALVAGE": return hills || nearMountains ? 0 : 1;
  }
};
