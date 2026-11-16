import { describe, expect, it } from "vitest";
import { networkBiomePriority, type NetworkBiomeContext } from "./resource-network-biomes.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "./resource-networks.js";
import { TECH_REQUIREMENTS_BY_STRUCTURE } from "../structure-registry-economic.js";
const context = (changes: Partial<NetworkBiomeContext> = {}): NetworkBiomeContext => ({
  biome: "GRASS", forest: false, hills: false, tropical: false, nearMountains: false, ...changes
});
describe("frontier habitats and progression", () => {
  it("keeps salvage deposits scarce and sizes biota from towns", () => {
    expect(NETWORK_RESOURCES.map(resource => RESOURCE_NETWORKS[resource].sitesPerStandardMap)).toEqual([540, 90]);
    expect(RESOURCE_NETWORKS.LUXURY_BIOTA.sitesPerTown).toBe(1.5);
  });
  it("prefers tropical luxury plants and salvage near mountains", () => {
    expect(networkBiomePriority("LUXURY_BIOTA", context({ tropical: true }))).toBe(0);
    expect(networkBiomePriority("LUXURY_BIOTA", context())).toBe(1);
    expect(networkBiomePriority("LUXURY_BIOTA", context({ biome: "SAND" }))).toBeUndefined();
    expect(networkBiomePriority("PRECURSOR_SALVAGE", context({ nearMountains: true }))).toBe(0);
  });
  it("shares reclamation's unlock with the Manufactory", () => {
    expect(RESOURCE_NETWORKS.PRECURSOR_SALVAGE.tech).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY);
    expect(TECH_REQUIREMENTS_BY_STRUCTURE.RECLAMATION_WORKS).toBe(TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY);
  });
});
