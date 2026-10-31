import { expect, it } from "vitest";
import { RESOURCE_NETWORKS, type NetworkResource } from "./resource-networks.js";
import { economicStructureBuildDurationMs, structureBuildManpowerCost, structureBuildManpowerCostScaled } from "../structure-costs/structure-costs.js";

const prices: readonly (readonly [NetworkResource, number])[] = [
  ["NEURAL_RESIN", 40], ["CONDUCTIVE_MINERALS", 50], ["CATALYTIC_DEPOSIT", 50], ["LUXURY_BIOTA", 33], ["PRECURSOR_SALVAGE", 60]
];
it.each(prices)("%s is priced at about one third and below an Ancillary Factory", (resource, price) => {
  const { building } = RESOURCE_NETWORKS[resource];
  expect(structureBuildManpowerCost(building)).toBe(price);
  expect(economicStructureBuildDurationMs(building)).toBe(price * 1_000);
  for (const count of [0, 1, 5]) expect(structureBuildManpowerCostScaled(building, count)).toBeLessThan(structureBuildManpowerCostScaled("ANCILLARY_FACTORY", count));
});
