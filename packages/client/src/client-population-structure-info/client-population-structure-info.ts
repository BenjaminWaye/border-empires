import {
  INCUBATION_ENGINE_INSTANT_POPULATION_BURST, INCUBATION_ENGINE_ONGOING_GROWTH_MULT,
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE, CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT
} from "@border-empires/shared";
import type { StructureInfoKey, StructureInfoView } from "../client-map-display.js";

type PopulationInfoBase = Omit<StructureInfoView, "image" | "effects" | "modifiers" | "upkeepBits" | "branch">;
type PopulationInfoDeps = {
  readonly structure: (base: PopulationInfoBase, image?: string) => StructureInfoView;
  readonly imageFor: (key: StructureInfoKey) => string | undefined;
  readonly costBitsFor: (key: StructureInfoKey) => string[];
  readonly buildTimeLabelFor: (key: StructureInfoKey) => string;
};

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

export const populationStructureInfoView = (type: StructureInfoKey, deps: PopulationInfoDeps): StructureInfoView | undefined => {
  if (type !== "INCUBATION_ENGINE" && type !== "CENSUS_HALL") return undefined;
  const incubation = type === "INCUBATION_ENGINE";
  return deps.structure({
    title: incubation ? "Incubation Engine" : "Census Hall",
    detail: populationStructureDescription(type),
    glyph: incubation ? "◉" : "⌘",
    placement: "Build on an open garrisoned support tile for a town you own.",
    costBits: deps.costBitsFor(type),
    buildTimeLabel: deps.buildTimeLabelFor(type)
  }, deps.imageFor(type));
};
