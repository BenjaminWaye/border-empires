// Why a town is unfed, in the HUD's terse form (playtest 2026-11-27:
// "Aelharbor" starved again and nothing said why). A town is fed when the
// empire's FOOD slots cover its whole demand (all or nothing, oldest-held
// towns first); garrisoned grain or fish sites and Farm Plots supply slots.

import type { Tile } from "../client-types.js";
import { townFoodSlotDemand } from "./client-town-food-demand.js";

type UnfedTown = Pick<NonNullable<Tile["town"]>, "populationTier" | "foodSlotDemand">;

export const TOWN_UNFED_FIX = "build Farm Plot / garrison grain or fish";

/** "Unfed · needs 2 food". */
export const townUnfedReason = (town: UnfedTown): string => `Unfed · needs ${townFoodSlotDemand(town)} food`;

/** "Unfed · needs 2 food · build Farm Plot / garrison grain or fish": the alert line. */
export const townUnfedDetail = (town: UnfedTown): string => `${townUnfedReason(town)} · ${TOWN_UNFED_FIX}`;
