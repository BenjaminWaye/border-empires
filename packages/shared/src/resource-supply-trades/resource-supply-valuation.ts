import { TRADABLE_SUPPLY_RESOURCES, type ResourceSupplyAmounts, type ResourceSupplyOffer } from "./resource-supply-trades.js";

/**
 * Starting AI negotiation values per slot (or developed frontier site) per day.
 * Players can negotiate different prices. Frontier sites are priced well above
 * upkeep slots because a site the buyer lacks adds a City's worth of manpower
 * (or two biota slots); salvage can't be traded.
 */
export const RESOURCE_SUPPLY_COIN_VALUE_PER_DAY: Readonly<ResourceSupplyAmounts> = {
  FOOD: 4, TITANIUM: 4, CRYSTAL: 6, UMBRITE: 4, NEURAL_RESIN: 8, CONDUCTIVE_MINERALS: 8,
  CATALYTIC_DEPOSIT: 8, LUXURY_BIOTA: 10, PRECURSOR_SALVAGE: 0
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
