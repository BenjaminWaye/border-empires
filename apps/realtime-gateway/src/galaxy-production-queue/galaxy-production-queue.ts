// Production helpers for the Duke layer (§21.8): Production is a daily *rate*,
// not a wallet. The per-system slot itself lives in galaxy-duke-engine.
import type { GalaxySpecialization } from "@border-empires/sim-protocol";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// §23 first-pass daily rates for a Planet. An Outpost yields half.
const PLANET_DAILY_PRODUCTION: Record<GalaxySpecialization, number> = {
  INDUSTRIAL: 6,
  EXTRACTION: 6,
  LOGISTICS: 4,
  TRADE: 2,
  CAPITAL: 2
};

export const dailyProductionRate = (specialization: GalaxySpecialization, tier: "PLANET" | "OUTPOST"): number => {
  const planetRate = PLANET_DAILY_PRODUCTION[specialization];
  return tier === "PLANET" ? planetRate : planetRate / 2;
};

// Days to finish `cost` at `ratePerDay`; Infinity when the rate is 0.
export const daysToComplete = (cost: number, ratePerDay: number): number =>
  ratePerDay <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(cost / ratePerDay);
