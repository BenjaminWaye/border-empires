import {
  INCUBATION_ENGINE_INSTANT_POPULATION_BURST, INCUBATION_ENGINE_ONGOING_GROWTH_MULT,
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE, CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT
} from "@border-empires/shared";

type PopulationKind = "INCUBATION_ENGINE" | "CENSUS_HALL";

// FOOD is an input slot requirement, not an output or an efficiency bonus.
export const populationStructureDescription = (type: PopulationKind): string => {
  const burst = INCUBATION_ENGINE_INSTANT_POPULATION_BURST.toLocaleString("en-US");
  const growth = Math.round((INCUBATION_ENGINE_ONGOING_GROWTH_MULT - 1) * 100);
  const capacity = CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE.toLocaleString("en-US");
  const discount = Math.round((1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100);
  return type === "INCUBATION_ENGINE"
    ? `Incubation Engines add +${burst} population once, on completion, and +${growth}% ongoing population growth to their supported town.`
    : `Census Halls add +${capacity} population capacity per connected town with an active Incubation Engine and reduce their own town's town-tier upgrade Coin cost by ${discount}%.`;
};
