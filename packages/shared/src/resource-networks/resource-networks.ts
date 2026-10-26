import { MANPOWER_REFILL_WINDOW_MS } from "../manpower-refill.js";

/** Developed deposits provide renewable, exclusive bonus supply slots. */
export const RESOURCE_NETWORKS = {
  NEURAL_RESIN: {
    name: "Neural resin", building: "RESIN_EXTRACTOR", buildingName: "Resin Extractor",
    tech: "neural-resin-processing", color: "#e8aa48", glyph: "◉", manpowerCost: 120,
    batchBonus: 12, creditPerDay: 0, target: "ANCILLARY_FACTORY", sitesPerStandardMap: 180,
    description: "Native resin used to integrate town-supplied bodies with Ancillary control systems.",
    effect: "Supplies one resin slot: +12 Ancillaries per batch at one active Ancillary Factory."
  },
  CONDUCTIVE_MINERALS: {
    name: "Conductive minerals", building: "IMPLANT_FOUNDRY", buildingName: "Implant Foundry",
    tech: "implant-metallurgy", color: "#62d7cd", glyph: "ϟ", manpowerCost: 150,
    batchBonus: 6, creditPerDay: 0, target: "ANCILLARY_FACTORY", sitesPerStandardMap: 180,
    description: "Conductive ores refined into implants, command circuitry and replacement components.",
    effect: "Supplies one conductive-mineral slot: +6 Ancillaries per batch at one active Ancillary Factory."
  },
  CATALYTIC_DEPOSIT: {
    name: "Catalytic deposit", building: "CATALYST_REFINERY", buildingName: "Catalyst Refinery",
    tech: "frontier-concessions", color: "#e0cf82", glyph: "⬡", manpowerCost: 150,
    batchBonus: 0, creditPerDay: 1.5, target: "TRADE_NEXUS", sitesPerStandardMap: 150,
    description: "Rare catalyst-bearing ores prized by offworld chemical and fabrication industries.",
    effect: "Supplies one catalyst slot: +1.5 Coin/day at one active Trade Nexus."
  },
  LUXURY_BIOTA: {
    name: "Luxury biota", building: "CULTIVATION_ESTATE", buildingName: "Cultivation Estate",
    tech: "frontier-concessions", color: "#e88eae", glyph: "❋", manpowerCost: 100,
    batchBonus: 0, creditPerDay: 1.5, target: "TRADE_NEXUS", sitesPerStandardMap: 150,
    description: "Native plants cultivated for fragrances, pigments and intoxicants sought in the Core.",
    effect: "Supplies one luxury slot: +1.5 Coin/day at one active Trade Nexus."
  },
  PRECURSOR_SALVAGE: {
    name: "Precursor salvage", building: "RECLAMATION_WORKS", buildingName: "Reclamation Works",
    tech: "salvage-reclamation", color: "#97aec7", glyph: "⚙", manpowerCost: 180,
    batchBonus: 0, creditPerDay: 1.5, target: "MANUFACTORY", sitesPerStandardMap: 120,
    description: "Buried pre-Court machinery whose recoverable tools and components improve local manufacturing.",
    effect: "Supplies one salvage slot: +1.5 Coin/day at one active Manufactory."
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

/** Each renewable supply slot can equip one beneficiary; spare slots stay available. */
export const suppliedNetworkBuildings = (slots: number, buildings: number): number =>
  Math.min(Math.max(0, Math.floor(slots)), Math.max(0, Math.floor(buildings)));
export type NetworkSiteCounts = Record<NetworkResource, number>;
export type NetworkSupplyStatus = { readonly supply: NetworkSiteCounts; readonly used: NetworkSiteCounts };
export const emptyNetworkSiteCounts = (): NetworkSiteCounts => ({
  NEURAL_RESIN: 0, CONDUCTIVE_MINERALS: 0, CATALYTIC_DEPOSIT: 0, LUXURY_BIOTA: 0, PRECURSOR_SALVAGE: 0
});
export const networkFactoryRegenPerMinute = (counts: NetworkSiteCounts, factoryCount: number): number =>
  NETWORK_RESOURCES.reduce((sum, resource) =>
    sum + suppliedNetworkBuildings(counts[resource], factoryCount) * RESOURCE_NETWORKS[resource].batchBonus, 0) /
  (MANPOWER_REFILL_WINDOW_MS / 60_000);
export const networkCreditPerMinute = (counts: NetworkSiteCounts, target: "MANUFACTORY" | "TRADE_NEXUS", buildings: number): number =>
  NETWORK_RESOURCES.reduce((sum, resource) => sum +
    (RESOURCE_NETWORKS[resource].target === target ? suppliedNetworkBuildings(counts[resource], buildings) * RESOURCE_NETWORKS[resource].creditPerDay : 0), 0) / 1440;
