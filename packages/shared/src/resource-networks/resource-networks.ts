/** What a developed frontier deposit does for its owner (docs/game-mechanics.md, frontier resources). */
export type NetworkRole = "ANCILLARY_MATERIAL" | "BIOTA" | "SALVAGE";

/**
 * Frontier deposits. Counts are developed tiles ("sites"); every developed
 * tile counts on its own. `sitesPerStandardMap` is the tile budget for a
 * 640×320 map (about 360 towns) and scales with map area.
 */
export const RESOURCE_NETWORKS = {
  NEURAL_RESIN: {
    name: "Neural resin", building: "RESIN_EXTRACTOR", buildingName: "Resin Extractor",
    tech: "neural-resin-processing", color: "#e8aa48", glyph: "◉", manpowerCost: 40,
    role: "ANCILLARY_MATERIAL", sitesPerStandardMap: 160,
    description: "Native resin stabilises the neural controls of newly remade Ancillaries.",
    effect: "+120 manpower per refill for your first resin site, +30 for each extra one."
  },
  CONDUCTIVE_MINERALS: {
    name: "Conductive minerals", building: "IMPLANT_FOUNDRY", buildingName: "Implant Foundry",
    tech: "organized-supply", color: "#62d7cd", glyph: "ϟ", manpowerCost: 50,
    role: "ANCILLARY_MATERIAL", sitesPerStandardMap: 160,
    description: "Conductive ore becomes Ancillary implants and control circuitry.",
    effect: "+120 manpower per refill for your first conductive site, +30 for each extra one."
  },
  CATALYTIC_DEPOSIT: {
    name: "Catalytic deposit", building: "CATALYST_REFINERY", buildingName: "Catalyst Refinery",
    tech: "frontier-concessions", color: "#e0cf82", glyph: "⬡", manpowerCost: 50,
    role: "ANCILLARY_MATERIAL", sitesPerStandardMap: 160,
    description: "Rare catalysts drive the chemistry that remakes people into Ancillaries.",
    effect: "+120 manpower per refill for your first catalyst site, +30 for each extra one."
  },
  LUXURY_BIOTA: {
    name: "Luxury biota", building: "CULTIVATION_ESTATE", buildingName: "Cultivation Estate",
    tech: "frontier-concessions", color: "#e88eae", glyph: "❋", manpowerCost: 33,
    role: "BIOTA", sitesPerStandardMap: 70,
    description: "House-supplied intoxicants keep the civilians of large towns dependent and in place.",
    effect: "Supplies 2 biota slots. Each slot lets a City, Great City or Metropolis give one more tier of manpower."
  },
  PRECURSOR_SALVAGE: {
    name: "Precursor salvage", building: "RECLAMATION_WORKS", buildingName: "Reclamation Works",
    tech: "trade", color: "#97aec7", glyph: "⚙", manpowerCost: 60,
    role: "SALVAGE", sitesPerStandardMap: 90,
    description: "Finite Concordance components, fitted to House arms or shipped to the Court.",
    effect: "+1% attack and defense while it holds loads (up to +10%). Ship a load to the Court for an Imperial delivery."
  }
} as const satisfies Record<string, {
  name: string; building: string; buildingName: string; tech: string; color: string; glyph: string;
  manpowerCost: number; role: NetworkRole; sitesPerStandardMap: number; description: string; effect: string;
}>;
export type NetworkResource = keyof typeof RESOURCE_NETWORKS;
export type NetworkBuilding = (typeof RESOURCE_NETWORKS)[NetworkResource]["building"];
export type NetworkBuildAction = `build_${Lowercase<NetworkBuilding>}`;
export const NETWORK_RESOURCES = Object.keys(RESOURCE_NETWORKS) as NetworkResource[];
export const ANCILLARY_MATERIAL_RESOURCES = NETWORK_RESOURCES.filter(resource => RESOURCE_NETWORKS[resource].role === "ANCILLARY_MATERIAL");
export const isNetworkResource = (value: string | undefined): value is NetworkResource =>
  value !== undefined && Object.hasOwn(RESOURCE_NETWORKS, value);
export const networkResourceForBuilding = (value: string): NetworkResource | undefined =>
  NETWORK_RESOURCES.find(resource => RESOURCE_NETWORKS[resource].building === value);
export const networkBuildAction = (resource: NetworkResource): NetworkBuildAction =>
  `build_${RESOURCE_NETWORKS[resource].building.toLowerCase()}` as NetworkBuildAction;
export const networkResourceForAction = (action: string): NetworkResource | undefined =>
  NETWORK_RESOURCES.find(resource => networkBuildAction(resource) === action);

export type NetworkSiteCounts = Record<NetworkResource, number>;
/**
 * Economy-panel view. `supply` = developed sites (after trades). `used` = sites
 * whose output is doing something: every material and salvage site, and the
 * biota sites whose slots went to a town.
 */
export type NetworkSupplyStatus = { readonly supply: NetworkSiteCounts; readonly used: NetworkSiteCounts };
export const emptyNetworkSiteCounts = (): NetworkSiteCounts => ({
  NEURAL_RESIN: 0, CONDUCTIVE_MINERALS: 0, CATALYTIC_DEPOSIT: 0, LUXURY_BIOTA: 0, PRECURSOR_SALVAGE: 0
});
