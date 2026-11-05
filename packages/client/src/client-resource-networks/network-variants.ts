import { wrapX, wrapY, WORLD_WIDTH, WORLD_HEIGHT, type NetworkResource } from "@border-empires/shared";
export const NETWORK_VARIANTS = [0, 1, 2] as const;
export type NetworkVariant = typeof NETWORK_VARIANTS[number];
/** World coordinates, never camera-relative placement: stable through panning and wrapping. */
export const networkVariantForTile = (x: number, y: number): NetworkVariant =>
  (((((wrapX(x,WORLD_WIDTH) + 1) * 374761393) ^ ((wrapY(y,WORLD_HEIGHT) + 1) * 668265263)) >>> 0) % 3) as NetworkVariant;
export const networkDepositFilename = (resource: NetworkResource, variant: NetworkVariant): string =>
  `${resource.toLowerCase().replaceAll("_", "-")}-deposit${variant === 0 ? "" : `-${variant + 1}`}.svg`;
export const NETWORK_VARIANT_NAMES: Readonly<Record<NetworkResource, readonly [string,string,string]>> = {
  NEURAL_RESIN: ["Mature grove", "Paired crowns", "Low thicket"],
  CONDUCTIVE_MINERALS: ["Vein ridge", "Split lode", "Ore fan"],
  CATALYTIC_DEPOSIT: ["Layered outcrop", "Twin spires", "Weathered seam"],
  LUXURY_BIOTA: ["Rosette garden", "Blooming stand", "Meadow patch"],
  PRECURSOR_SALVAGE: ["Broken power train", "Collapsed gantry", "Shattered rotor"]
};
