import { describe, expect, it } from "vitest";
import { networkBiomePriority, type NetworkBiomeContext } from "./resource-network-biomes.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "./resource-networks.js";
import { TECH_REQUIREMENTS_BY_STRUCTURE } from "../structure-registry-economic.js";
const context = (changes: Partial<NetworkBiomeContext> = {}): NetworkBiomeContext => ({
  biome: "GRASS", forest: false, hills: false, tropical: false, nearMountains: false, ...changes
});
describe("frontier habitats and progression", () => {
  it("gives all five resources the same thousand-tile standard-map budget", () => {
    for (const resource of NETWORK_RESOURCES) expect(RESOURCE_NETWORKS[resource].sitesPerStandardMap).toBe(1000);
  });
  it("prefers forest resin, rocky/cold conductors, arid catalysts and tropical luxury plants", () => {
    expect(networkBiomePriority("NEURAL_RESIN", context({ forest: true }))).toBe(0);
    expect(networkBiomePriority("NEURAL_RESIN", context())).toBe(1);
    expect(networkBiomePriority("NEURAL_RESIN", context({ biome: "TUNDRA" }))).toBeUndefined();
    expect(networkBiomePriority("CONDUCTIVE_MINERALS", context({ hills: true }))).toBe(0);
    expect(networkBiomePriority("CONDUCTIVE_MINERALS", context({ biome: "TUNDRA" }))).toBe(0);
    expect(networkBiomePriority("CATALYTIC_DEPOSIT", context({ biome: "SAND" }))).toBe(0);
    expect(networkBiomePriority("CATALYTIC_DEPOSIT", context({ biome: "TUNDRA" }))).toBe(1);
    expect(networkBiomePriority("CATALYTIC_DEPOSIT", context())).toBeUndefined();
    expect(networkBiomePriority("LUXURY_BIOTA", context({ tropical: true }))).toBe(0);
    expect(networkBiomePriority("LUXURY_BIOTA", context())).toBe(1);
    expect(networkBiomePriority("LUXURY_BIOTA", context({ biome: "SAND" }))).toBeUndefined();
    expect(networkBiomePriority("PRECURSOR_SALVAGE", context({ nearMountains: true }))).toBe(0);
  });
  it("shares Implant Foundry's unlock with the Depot and reclamation's unlock with the Manufactory", () => {
    expect(RESOURCE_NETWORKS.CONDUCTIVE_MINERALS.tech).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.ANCILLARY_DEPOT);
    expect(TECH_REQUIREMENTS_BY_STRUCTURE.IMPLANT_FOUNDRY).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.ANCILLARY_DEPOT);
    expect(RESOURCE_NETWORKS.PRECURSOR_SALVAGE.tech).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY);
    expect(TECH_REQUIREMENTS_BY_STRUCTURE.RECLAMATION_WORKS).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY);
  });
});
