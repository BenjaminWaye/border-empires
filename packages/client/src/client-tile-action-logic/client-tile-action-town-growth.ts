// Town growth upgrade tile-action split out of client-tile-action-logic.ts to
// keep that file from growing past the repo's 500-line cap.
import { supportRingRadiusForTier, TOWN_MANPOWER_BY_TIER, type TownGrowthUpgradeView } from "@border-empires/shared";
import { townPopulationMultiplier } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";
import type { TileActionDef } from "../client-types.js";
import { tileActionAvailability } from "./client-tile-action-logic.js";

const townGrowthUpgradeBonusDetail = (targetTier: "CITY" | "GREAT_CITY" | "METROPOLIS"): string => {
  const incomeBonusPercent = Math.round((townPopulationMultiplier(targetTier) - 1) * 100);
  const manpower = TOWN_MANPOWER_BY_TIER[targetTier];
  const manpowerRegen = Math.round(manpower.regenPerMinute * 10) / 10;
  const ringBonus =
    targetTier === "GREAT_CITY" && supportRingRadiusForTier(targetTier) > 1
      ? " Adds a second ring of build tiles around the town."
      : "";
  return `+${incomeBonusPercent}% gold income, ${manpower.cap} manpower cap, +${manpowerRegen} manpower regen/min.${ringBonus}`;
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
  const hasFoodSlot = (state.resourceSlots?.supply.FOOD ?? 0) - (state.resourceSlots?.demand.FOOD ?? 0) >= 1;
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
  const missingReason = !hasGold ? `Need ${upgrade.goldCost} gold` : "Need a free FOOD slot";
  return {
    id,
    label,
    ...(enabled ? { detail } : {}),
    ...tileActionAvailability(enabled, missingReason, `${upgrade.goldCost} gold + 1 FOOD slot`)
  };
};
