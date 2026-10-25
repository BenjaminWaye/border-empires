import { MANPOWER_REFILL_WINDOW_MS } from "../manpower-refill.js";

/** Deposits are economic opportunities, not stockpiles or resource-slot pools. */
export const RESOURCE_NETWORKS = {
  NEURAL_RESIN: {
    name: "Neural resin", building: "RESIN_EXTRACTOR", buildingName: "Resin Extractor",
    tech: "neural-resin-processing", color: "#e8aa48", glyph: "◉", manpowerCost: 120,
    batchBonus: 4, creditPerDay: 0, target: "ANCILLARY_FACTORY", sitesPerStandardMap: 180,
    description: "Native resin used to integrate town-supplied bodies with Ancillary control systems.",
    effect: "+4 Ancillaries per batch per active Ancillary Factory for each effective developed resin site."
  },
  CONDUCTIVE_MINERALS: {
    name: "Conductive minerals", building: "IMPLANT_FOUNDRY", buildingName: "Implant Foundry",
    tech: "implant-metallurgy", color: "#62d7cd", glyph: "ϟ", manpowerCost: 150,
    batchBonus: 2, creditPerDay: 0, target: "ANCILLARY_FACTORY", sitesPerStandardMap: 180,
    description: "Conductive ores refined into implants, command circuitry and replacement components.",
    effect: "+2 Ancillaries per batch per active Ancillary Factory for each effective developed mineral site."
  },
  CATALYTIC_DEPOSIT: {
    name: "Catalytic deposit", building: "CATALYST_REFINERY", buildingName: "Catalyst Refinery",
    tech: "frontier-concessions", color: "#e0cf82", glyph: "⬡", manpowerCost: 150,
    batchBonus: 0, creditPerDay: 0.5, target: "TRADE_NEXUS", sitesPerStandardMap: 150,
    description: "Rare catalyst-bearing ores prized by offworld chemical and fabrication industries.",
    effect: "+0.5 Coin/day per active Trade Nexus for each effective developed catalyst site."
  },
  LUXURY_BIOTA: {
    name: "Luxury biota", building: "CULTIVATION_ESTATE", buildingName: "Cultivation Estate",
    tech: "frontier-concessions", color: "#e88eae", glyph: "❋", manpowerCost: 100,
    batchBonus: 0, creditPerDay: 0.5, target: "TRADE_NEXUS", sitesPerStandardMap: 150,
    description: "Native plants cultivated for fragrances, pigments and intoxicants sought in the Core.",
    effect: "+0.5 Coin/day per active Trade Nexus for each effective developed luxury site."
  },
  PRECURSOR_SALVAGE: {
    name: "Precursor salvage", building: "RECLAMATION_WORKS", buildingName: "Reclamation Works",
    tech: "salvage-reclamation", color: "#97aec7", glyph: "⚙", manpowerCost: 180,
    batchBonus: 0, creditPerDay: 0.5, target: "MANUFACTORY", sitesPerStandardMap: 120,
    description: "Buried pre-Court machinery whose recoverable tools and components improve local manufacturing.",
    effect: "+0.5 Coin/day per active Manufactory for each effective developed salvage site."
  }
} as const;
export type NetworkResource = keyof typeof RESOURCE_NETWORKS;
export type NetworkBuilding = (typeof RESOURCE_NETWORKS)[NetworkResource]["building"];
export type NetworkBuildAction = `build_${Lowercase<NetworkBuilding>}`;
export const NETWORK_RESOURCES = Object.keys(RESOURCE_NETWORKS) as NetworkResource[];
export const isNetworkResource = (value: string | undefined): value is NetworkResource =>
  value !== undefined && Object.hasOwn(RESOURCE_NETWORKS, value);
export const networkResourceForBuilding = (value: string): NetworkResource | undefined =>
  NETWORK_RESOURCES.find(resource => RESOURCE_NETWORKS[resource].building === value);
export const networkBuildAction = (resource: NetworkResource): NetworkBuildAction =>
  `build_${RESOURCE_NETWORKS[resource].building.toLowerCase()}` as NetworkBuildAction;
export const networkResourceForAction = (action: string): NetworkResource | undefined =>
  NETWORK_RESOURCES.find(resource => networkBuildAction(resource) === action);

/** First three sites full value, next three half value; six is the useful cap. */
export const effectiveNetworkSites = (count: number): number =>
  Math.min(3, Math.max(0, count)) + Math.min(3, Math.max(0, count - 3)) * 0.5;
export type NetworkSiteCounts = Record<NetworkResource, number>;
export const emptyNetworkSiteCounts = (): NetworkSiteCounts => ({
  NEURAL_RESIN: 0, CONDUCTIVE_MINERALS: 0, CATALYTIC_DEPOSIT: 0, LUXURY_BIOTA: 0, PRECURSOR_SALVAGE: 0
});
export const networkFactoryRegenPerMinute = (counts: NetworkSiteCounts, factoryCount: number): number =>
  factoryCount * NETWORK_RESOURCES.reduce((sum, resource) =>
    sum + effectiveNetworkSites(counts[resource]) * RESOURCE_NETWORKS[resource].batchBonus, 0) /
  (MANPOWER_REFILL_WINDOW_MS / 60_000);
export const networkCreditPerMinute = (counts: NetworkSiteCounts, target: "MANUFACTORY" | "TRADE_NEXUS", buildings: number): number =>
  buildings * NETWORK_RESOURCES.reduce((sum, resource) => sum +
    (RESOURCE_NETWORKS[resource].target === target ? effectiveNetworkSites(counts[resource]) * RESOURCE_NETWORKS[resource].creditPerDay : 0), 0) / 1440;
