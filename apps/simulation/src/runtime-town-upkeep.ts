// Town upkeep that runs after each population growth tick, kept out of
// runtime.ts (over the repo's 500-line cap): the Census Hall population bonus
// (runtime-census-hall-bonus.ts) and due town focus changes
// (town-focus/town-focus-promotion.ts).
import { applyCensusHallPopulationBonuses, type CensusHallBonusDeps } from "./runtime-census-hall-bonus.js";
import { promoteDueTownFocus, type TownFocusPromotionDeps } from "./town-focus/town-focus-promotion.js";

export type TownUpkeepDeps = CensusHallBonusDeps & TownFocusPromotionDeps;

export const applyTownUpkeepAfterGrowth = (deps: TownUpkeepDeps, nowMs: number): void => {
  applyCensusHallPopulationBonuses(deps);
  promoteDueTownFocus(deps, nowMs);
};
