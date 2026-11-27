// Town growth upgrade tile-action split out of client-tile-action-logic.ts to
// keep that file from growing past the repo's 500-line cap.
import { manpowerPerBatch, nextTownGrowthUpgrade, supportRingRadiusForTier, TOWN_MANPOWER_BY_TIER, type TownGrowthUpgradeView } from "@border-empires/shared";
import { townPopulationMultiplier } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";
import { garrisonTownPlotsAction } from "../client-town-ring-garrison/client-town-plot-garrison.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { freeSlotsOf, resourceSlotReasonText } from "./client-resource-slot-reason.js";
import { tileActionAvailability } from "./client-tile-action-logic.js";

const previousTierOf = (tier: "CITY" | "GREAT_CITY" | "METROPOLIS"): string => (tier === "CITY" ? "TOWN" : tier === "GREAT_CITY" ? "CITY" : "GREAT_CITY");

const townGrowthUpgradeBonusDetail = (targetTier: "CITY" | "GREAT_CITY" | "METROPOLIS"): string => {
  const incomeBonusPercent = Math.round((townPopulationMultiplier(targetTier) - 1) * 100);
  const manpower = TOWN_MANPOWER_BY_TIER[targetTier];
  const manpowerRegen = Math.round(manpowerPerBatch(manpower.regenPerMinute));
  const ringBonus =
    supportRingRadiusForTier(targetTier) > supportRingRadiusForTier(previousTierOf(targetTier))
      ? " Adds a second ring of build tiles around the town."
      : "";
  return `+${incomeBonusPercent}% coin income, ${manpower.cap} manpower cap, +${manpowerRegen} manpower per batch.${ringBonus}`;
};

export const townGrowthActionForUpgrade = (
  state: ClientState,
  upgrade: TownGrowthUpgradeView | undefined
): TileActionDef | undefined => {
  if (!upgrade?.available) return undefined;
  // §5.4/user decision: gold + 1 free FOOD slot (the upgrade permanently
  // adds +1 FOOD slot demand to the town, townFoodSlotDemandForTier) —
  // replacing the old FOOD-stockpile lump-sum check now that FOOD has no
  // stockpile.
  const hasGold = state.gold >= upgrade.goldCost;
  const freeFood = freeSlotsOf(state.resourceSlots, "FOOD");
  const hasFoodSlot = freeFood >= 1;
  const enabled = hasGold && hasFoodSlot;
  const id =
    upgrade.targetTier === "TOWN"
      ? "grow_settlement_to_town"
      : upgrade.targetTier === "CITY"
        ? "grow_town_to_city"
        : upgrade.targetTier === "GREAT_CITY"
          ? "grow_city_to_great_city"
          : "grow_great_city_to_monumental_city";
  const label =
    upgrade.targetTier === "TOWN"
      ? "Upgrade Settlement to Town"
      : upgrade.targetTier === "CITY"
        ? "Upgrade Town to City"
        : upgrade.targetTier === "GREAT_CITY"
          ? "Upgrade City to Great City"
          : "Upgrade Great City to Metropolis";
  const detail =
    upgrade.targetTier === "TOWN"
      ? "Unlocks town-tier growth and upkeep."
      : townGrowthUpgradeBonusDetail(upgrade.targetTier);
  const missingReason = !hasGold ? `Need ${upgrade.goldCost} coin` : resourceSlotReasonText("FOOD", 1, freeFood);
  return {
    id,
    label,
    ...(enabled ? { detail } : {}),
    ...tileActionAvailability(enabled, missingReason, `${upgrade.goldCost} coin + 1 FOOD slot`)
  };
};

/** A town tile's growth upgrade (when available) and its "Garrison N plots" (when any plot is left to garrison). */
export const townGrowthAndPlotActions = (state: ClientState, tile: Tile): TileActionDef[] => {
  const growth = tile.town?.populationTier && typeof tile.town.population === "number"
    ? townGrowthActionForUpgrade(state, nextTownGrowthUpgrade(tile.town.populationTier, tile.town.population))
    : undefined;
  const plots = garrisonTownPlotsAction(state, tile);
  return [...(plots ? [plots] : []), ...(growth ? [growth] : [])];
};
