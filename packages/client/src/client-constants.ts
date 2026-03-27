import { FRONTIER_CLAIM_COST, FRONTIER_CLAIM_MS, grassShadeAt, landBiomeAt } from "@border-empires/shared";

import type { GuideStep } from "./client-types.js";

export const OBSERVATORY_BUILD_COST = 600;
export const OBSERVATORY_VISION_BONUS = 5;
export const OBSERVATORY_PROTECTION_RADIUS = 10;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 192;
export const GOLD_COST_EPSILON = 1e-6;
export const GUIDE_STORAGE_KEY = "border-empires-guide-complete-v1";
export const GUIDE_AUTO_OPEN_STORAGE_KEY = "border-empires-guide-auto-opened-v1";
export const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;

export const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Border Empires",
    body: "Expand, defend, and outmaneuver rival empires. Win the season by holding any victory condition continuously for 24 hours."
  },
  {
    title: "Expand Your Territory",
    body: "Tap nearby land to open expansion actions. Territory grows from unowned to frontier to settled, and settled land is what strengthens your empire."
  },
  {
    title: "Manage Resources",
    body: "Gold funds expansion and building. Iron supports war, Crystal fuels advanced actions, Supply supports outposts, and Food keeps towns productive."
  },
  {
    title: "Build Structures",
    body: "Open the Actions menu on your land to build forts, siege outposts, observatories, and economic structures on the tiles that matter most."
  },
  {
    title: "Use Abilities",
    body: "Technologies unlock powerful Crystal-based actions like sabotage, reconnaissance, and special attacks that can break open defended borders."
  },
  {
    title: "Win the Season",
    body: "Track victory races in the Victory panel. Town control, settled land, economy, resources, and continent reach can all decide the season if held for 24 hours."
  }
];

export const canAffordCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;

export const formatGoldAmount = (gold: number): string => gold.toFixed(2);

export const isForestTile = (x: number, y: number): boolean => landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

export const frontierClaimDurationMsForTile = (x: number, y: number): number => (isForestTile(x, y) ? FRONTIER_CLAIM_MS * 2 : FRONTIER_CLAIM_MS);

export const frontierClaimCostLabelForTile = (x: number, y: number): string => {
  const seconds = Math.round(frontierClaimDurationMsForTile(x, y) / 1000);
  return isForestTile(x, y) ? `${FRONTIER_CLAIM_COST} gold • ${seconds}s (Forest)` : `${FRONTIER_CLAIM_COST} gold • ${seconds}s`;
};
