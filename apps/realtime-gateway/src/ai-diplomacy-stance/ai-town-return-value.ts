// What an AI counts getting one of its own towns back for, in coin, when a
// deal returns it (the "return a town" term, shared diplomacy-town-return.ts):
//   - a day of the town's own coin income (the simulation reports it);
//   - hours of the AI's own income by the town's size, so a city it lost is
//     worth more than a town even when the town's income reads low;
//   - reparations: the town's tile counts as one tile of land given back,
//     at the REPARATION_HOURS_PER_TILE the truce price charges for it.
// The size and reparations parts scale with the AI's temperament tileGrudge
// (a Vengeful AI wants its land back more). A returned town also lifts the
// "it can still retake its land" truce refusal (ai-diplomacy-pricing.ts).
import type { PricedTown, ReturnableTown } from "@border-empires/shared";

import type { AiTemperament } from "./ai-diplomacy-temperament.js";

export const TOWN_RETURN_INCOME_HOURS = 24;
export const TOWN_RETURN_TIER_HOURS: Record<ReturnableTown["tier"], number> = {
  SETTLEMENT: 1, TOWN: 4, CITY: 8, GREAT_CITY: 12, METROPOLIS: 16
};

export const aiTownReturnValue = (
  town: Pick<ReturnableTown, "tier" | "goldPerMinute">,
  aiIncomePerMinute: number,
  temperament: Pick<AiTemperament, "tileGrudge">,
  reparationHoursPerTile: number
): number => {
  const townIncome = Math.max(0, town.goldPerMinute ?? 0) * 60 * TOWN_RETURN_INCOME_HOURS;
  const hours = (TOWN_RETURN_TIER_HOURS[town.tier] + reparationHoursPerTile) * temperament.tileGrudge;
  return Math.max(1, Math.round(townIncome + hours * 60 * aiIncomePerMinute));
};

/** The requester's towns this AI lost to it, each with the AI's price; others are left out. */
export const pricedReturnableTowns = (
  towns: readonly ReturnableTown[] | undefined,
  aiPlayerId: string,
  aiIncomePerMinute: number,
  temperament: Pick<AiTemperament, "tileGrudge">,
  reparationHoursPerTile: number
): PricedTown[] =>
  (towns ?? [])
    .filter((town) => town.toPlayerId === aiPlayerId)
    .map((town) => ({ x: town.x, y: town.y, value: aiTownReturnValue(town, aiIncomePerMinute, temperament, reparationHoursPerTile) }));
