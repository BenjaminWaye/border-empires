import { RESOURCE_NETWORKS } from "../resource-networks/resource-networks.js";
import { TRADABLE_SUPPLY_RESOURCES, type ResourceSupplyAmounts, type ResourceSupplyOffer } from "./resource-supply-trades.js";

/** Starting AI negotiation values per slot/day. Players can negotiate different prices. */
export const RESOURCE_SUPPLY_COIN_VALUE_PER_DAY: Readonly<ResourceSupplyAmounts> = {
  FOOD: 4, TITANIUM: 4, CRYSTAL: 6, UMBRITE: 4, NEURAL_RESIN: 4, CONDUCTIVE_MINERALS: 2,
  CATALYTIC_DEPOSIT: RESOURCE_NETWORKS.CATALYTIC_DEPOSIT.creditPerDay,
  LUXURY_BIOTA: RESOURCE_NETWORKS.LUXURY_BIOTA.creditPerDay,
  PRECURSOR_SALVAGE: RESOURCE_NETWORKS.PRECURSOR_SALVAGE.creditPerDay
};
export const resourceSupplyCoinValue = (offer: ResourceSupplyOffer | undefined, hours: number): number =>
  TRADABLE_SUPPLY_RESOURCES.reduce((sum, resource) => sum + (offer?.[resource] ?? 0) * RESOURCE_SUPPLY_COIN_VALUE_PER_DAY[resource], 0) * hours / 24;

export const missingResourceSupply = (requested: ResourceSupplyOffer | undefined, available: ResourceSupplyOffer | undefined): ResourceSupplyOffer => {
  const missing: ResourceSupplyOffer = {};
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    const count = Math.max(0, (requested?.[resource] ?? 0) - (available?.[resource] ?? 0));
    if (count > 0) missing[resource] = count;
  }
  return missing;
};
export const clampedResourceSupply = (requested: ResourceSupplyOffer | undefined, available: ResourceSupplyOffer | undefined): ResourceSupplyOffer => {
  const clamped: ResourceSupplyOffer = {};
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    const count = Math.min(requested?.[resource] ?? 0, available?.[resource] ?? 0);
    if (count > 0) clamped[resource] = count;
  }
  return clamped;
};
