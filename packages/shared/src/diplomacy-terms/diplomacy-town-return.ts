// "Return a town": a deal term that hands back towns the giver recently
// captured from the receiver. The simulation decides which towns qualify
// (apps/simulation/src/diplomacy-town-return/returnable-towns.ts): towns the
// giver still holds that its own TOWN_CAPTURED impact record says it took
// from the receiver within TOWN_RETURN_WINDOW_MS. Terms only name the tiles;
// the settlement re-checks eligibility before moving anything.
import { z } from "zod";

/** "Recently captured": the personal impact log's 24h window, the durable record of who took which town. */
export const TOWN_RETURN_WINDOW_MS = 24 * 60 * 60_000;
/** Most towns one side can hand back in a single deal or gift. */
export const MAX_TOWNS_PER_DEAL = 3;

export function townRefKey(town: { x: number; y: number }): string {
  return `${town.x},${town.y}`;
}

export const DiplomacyTownRefSchema = z.object({
  x: z.number().int().min(0).max(100_000),
  y: z.number().int().min(0).max(100_000)
});
export type DiplomacyTownRef = z.infer<typeof DiplomacyTownRefSchema>;
export const DiplomacyTownListSchema = z.array(DiplomacyTownRefSchema).max(MAX_TOWNS_PER_DEAL)
  .refine((towns) => new Set(towns.map(townRefKey)).size === towns.length, { message: "A town is listed twice." });

export const TownPopulationTierSchema = z.enum(["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]);

/** A town its holder may hand back to `toPlayerId`, as the simulation reports it. */
export const ReturnableTownSchema = DiplomacyTownRefSchema.extend({
  toPlayerId: z.string().min(1).max(160),
  name: z.string().max(120).optional(),
  tier: TownPopulationTierSchema,
  /** The town's own coin income now, when the simulation could read it. */
  goldPerMinute: z.number().min(0).optional(),
  capturedAt: z.number().int().nonnegative()
});
export type ReturnableTown = z.infer<typeof ReturnableTownSchema>;

/** What an AI counts a returnable town for, in coin (ai-town-return-value.ts in the gateway). */
export type PricedTown = DiplomacyTownRef & { value: number };

export const hasTowns = (towns: readonly DiplomacyTownRef[] | undefined): towns is readonly DiplomacyTownRef[] =>
  Boolean(towns && towns.length > 0);

/** "the town at (12, 40)", or "Oakridge (12, 40)" when the caller knows its name. */
export const townLabel = (town: DiplomacyTownRef, name?: string): string =>
  name ? `${name} (${town.x}, ${town.y})` : `the town at (${town.x}, ${town.y})`;

export const townsLabel = (towns: readonly DiplomacyTownRef[], nameOf?: (town: DiplomacyTownRef) => string | undefined): string =>
  `the return of ${towns.map((town) => townLabel(town, nameOf?.(town))).join(", ")}`;

/** Coin the AI counts for the towns in `towns` it has a price for; towns it doesn't recognise count nothing. */
export const townsValueToAi = (priced: readonly PricedTown[] | undefined, towns: readonly DiplomacyTownRef[] | undefined): number => {
  if (!priced || !hasTowns(towns)) return 0;
  const byKey = new Map(priced.map((town) => [townRefKey(town), town.value]));
  return towns.reduce((sum, town) => sum + (byKey.get(townRefKey(town)) ?? 0), 0);
};

/** True when `towns` includes at least one town the AI has priced (one it lost to the requester). */
export const returnsPricedTown = (priced: readonly PricedTown[] | undefined, towns: readonly DiplomacyTownRef[] | undefined): boolean => {
  if (!priced || !hasTowns(towns)) return false;
  const keys = new Set(priced.map(townRefKey));
  return towns.some((town) => keys.has(townRefKey(town)));
};

/**
 * Towns from `priced` (not already in `included`) that cover `deficit`, for an
 * AI counter-offer: the cheapest single town that covers it, else the most
 * valuable and repeat. `atLeastOne` adds a town even with no deficit left.
 */
export const townsToCover = (
  priced: readonly PricedTown[],
  included: readonly DiplomacyTownRef[],
  deficit: number,
  atLeastOne: boolean
): PricedTown[] => {
  const taken = new Set(included.map(townRefKey));
  const pool = priced.filter((town) => !taken.has(townRefKey(town))).sort((a, b) => a.value - b.value);
  const room = Math.max(0, MAX_TOWNS_PER_DEAL - included.length);
  const picked: PricedTown[] = [];
  let left = deficit;
  while (pool.length > 0 && picked.length < room && (left > 0 || (atLeastOne && picked.length === 0))) {
    const coverIndex = pool.findIndex((town) => town.value >= left);
    const [town] = pool.splice(coverIndex >= 0 ? coverIndex : pool.length - 1, 1);
    if (!town) break;
    picked.push(town);
    left -= town.value;
  }
  return picked;
};
