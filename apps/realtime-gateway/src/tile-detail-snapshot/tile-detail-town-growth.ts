// Town population-growth fields for the gateway's tile-detail builder, split
// out of tile-detail-snapshot.ts. Mirrors buildTownSummary's growth/modifier
// rules (apps/simulation/src/live-town-summary.ts) so a tile-detail response
// never disagrees with the sim's own town summary or growth-tick deltas.
import type { Tile } from "@border-empires/shared";
import {
  incubationEngineGrowthMultiplier,
  LONG_PEACE_GROWTH_MULT,
  LONG_PEACE_MS,
  POPULATION_GROWTH_BASE_RATE,
  SETTLEMENT_GROWTH_RATE_MULT
} from "@border-empires/game-domain";

type TownGrowthModifier = NonNullable<NonNullable<Tile["town"]>["growthModifiers"]>[number];

export type SnapshotTownGrowthInput = {
  parsedTown: Partial<NonNullable<Tile["town"]>> | undefined;
  isFed: boolean;
  populationTier: string;
  hasIncubationEngine: boolean;
  // Mercantile Charter (see firstThreeTownMultipliersForTile's doc comment):
  // 1 when inactive/not one of the player's first three towns.
  firstThreeTownPopGrowthMult: number;
  nowMs: number;
};

export type SnapshotTownGrowth = {
  populationGrowthPerMinute: number | undefined;
  growthModifiers: TownGrowthModifier[];
};

const activeUntil = (until: number | undefined, nowMs: number): boolean => typeof until === "number" && until > nowMs;

// Natural (unpaused) growth from population alone. The gateway can't see the
// owner's empire-integrity multiplier, so this is only a fallback for a town
// the sim's population-growth tick hasn't stamped a rate on yet.
const recomputedGrowthPerMinute = (input: SnapshotTownGrowthInput, hasLongPeace: boolean): number | undefined => {
  if (!input.isFed) return 0;
  const { population, maxPopulation } = input.parsedTown ?? {};
  if (typeof population !== "number" || typeof maxPopulation !== "number") return undefined;
  const logisticFactor = 1 - population / Math.max(1, maxPopulation);
  if (logisticFactor <= 0) return 0;
  const growth =
    population *
    POPULATION_GROWTH_BASE_RATE *
    (input.populationTier === "SETTLEMENT" ? SETTLEMENT_GROWTH_RATE_MULT : 1) *
    incubationEngineGrowthMultiplier(input.hasIncubationEngine) *
    input.firstThreeTownPopGrowthMult *
    (hasLongPeace ? LONG_PEACE_GROWTH_MULT : 1) *
    logisticFactor;
  return Number(growth.toFixed(4));
};

export const snapshotTownGrowth = (input: SnapshotTownGrowthInput): SnapshotTownGrowth => {
  const town = input.parsedTown;
  const hasLongPeace = !town?.nearbyWarLastAt || input.nowMs - town.nearbyWarLastAt >= LONG_PEACE_MS;
  const recomputed = recomputedGrowthPerMinute(input, hasLongPeace);
  const naturalGrowth = recomputed ?? 0;
  // Pauses come from the authoritative timers on the stored town record, the
  // same signals buildTownSummary and the growth tick use.
  if (activeUntil(town?.captureShockUntil, input.nowMs)) {
    return { populationGrowthPerMinute: 0, growthModifiers: [{ label: "Recently captured", deltaPerMinute: -naturalGrowth }] };
  }
  if (activeUntil(town?.nearbyWarPausedUntil, input.nowMs)) {
    return {
      populationGrowthPerMinute: 0,
      growthModifiers: naturalGrowth > 0 ? [{ label: "Nearby war", deltaPerMinute: -naturalGrowth }] : []
    };
  }
  if (!input.isFed || recomputed === 0) return { populationGrowthPerMinute: 0, growthModifiers: [] };
  // Trust the rate the sim's growth tick actually applied (it includes
  // empire integrity); only recompute when it hasn't stamped one yet.
  const stamped = town?.populationGrowthPerMinute;
  const populationGrowthPerMinute = typeof stamped === "number" && Number.isFinite(stamped) && stamped > 0 ? stamped : recomputed;
  const growthModifiers: TownGrowthModifier[] =
    hasLongPeace && typeof populationGrowthPerMinute === "number" && populationGrowthPerMinute > 0
      ? [{ label: "Long time peace", deltaPerMinute: Number((populationGrowthPerMinute * (1 - 1 / LONG_PEACE_GROWTH_MULT)).toFixed(4)) }]
      : [];
  return { populationGrowthPerMinute, growthModifiers };
};
