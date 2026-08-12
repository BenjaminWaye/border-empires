import {
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING
} from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const formatPercent = (mult: number): string => `${mult >= 0 ? "+" : ""}${(mult * 100).toFixed(1).replace(/\.0$/, "")}%`;

// This one building's own per-copy contribution (flat constant). Empire-wide,
// not scoped to its town's connected network — every active copy a player
// owns anywhere contributes the same amount regardless of which town network
// it sits in or how far it is from a given fight. The empire-wide total is
// shown on the tech tab's Attack/Defense stats.
export const weaponsFactoryOwnBonusLine = (tile: Tile): string | undefined => {
  if (tile.economicStructure?.status !== "active") return undefined;
  if (tile.economicStructure.type === "TITANIUM_WEAPONS_FACTORY") {
    return `This Titanium Weapons Factory contributes ${formatPercent(TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING)} attack / ${formatPercent(TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING)} defense to your empire.`;
  }
  if (tile.economicStructure.type === "UMBRITE_WEAPONS_FACTORY") {
    return `This Umbrite Weapons Factory contributes ${formatPercent(UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING)} attack / ${formatPercent(UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING)} defense to your empire.`;
  }
  return undefined;
};
