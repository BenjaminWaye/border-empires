import { townFoodSlotDemandForTier } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/**
 * FOOD slots a town draws. The simulation stamps foodSlotDemand on the owner's
 * towns after every upgrade waiver (Founding Concession, Treasury State,
 * Enduring Realm, Ministry Hall...), the same per-town number its slot gate and
 * dormancy use. The tier's base demand is only the fallback for a payload
 * without it (a foreign town, an older server).
 */
export const townFoodSlotDemand = (town: Pick<NonNullable<Tile["town"]>, "populationTier" | "foodSlotDemand">): number =>
  typeof town.foodSlotDemand === "number" && Number.isFinite(town.foodSlotDemand) ? town.foodSlotDemand : townFoodSlotDemandForTier(town.populationTier);
