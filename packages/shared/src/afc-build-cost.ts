import { techGoldCostForResearchedCount } from "./tech-economy.js";

/** The first additional AFC costs the same as a player's ninth Manifest. */
export const AFC_BUILD_COST_ANCHOR_TECH_COUNT = 8;
export const AFC_BUILD_COST_GROWTH = 2;

/** Coin price for the next AFC, based on all AFCs currently owned (including captured ones). */
export const afcBuildCost = (ownedAfcCount: number): number =>
  techGoldCostForResearchedCount(AFC_BUILD_COST_ANCHOR_TECH_COUNT) * AFC_BUILD_COST_GROWTH ** Math.max(0, ownedAfcCount - 1);
