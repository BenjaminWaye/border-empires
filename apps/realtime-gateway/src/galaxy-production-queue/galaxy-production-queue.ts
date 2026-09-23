// §21.8: Production is a daily *rate*, not a wallet. A Duke has one build
// slot fed automatically every day; days to complete = ceil(cost / rate).
// Pure logic only -- not yet wired to routes or the scheduler.
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

export type ProductionBuildKind = "FLEET" | "DEVELOPMENT" | "WONDER" | "FORTIFY" | "REFIT";

export type ProductionBuild = {
  kind: ProductionBuildKind;
  label: string;
  cost: number;
  progress: number;
};

export type ProductionQueueState = { slot: ProductionBuild | null };

// Days a fresh build takes at the current rate; Infinity when the rate is 0.
export const daysToComplete = (cost: number, ratePerDay: number): number =>
  ratePerDay <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(cost / ratePerDay);

export const startBuild = (state: ProductionQueueState, build: Omit<ProductionBuild, "progress">): ProductionQueueState => {
  if (build.cost <= 0) throw new Error("build cost must be positive");
  return { slot: { ...build, progress: state.slot && state.slot.kind === build.kind && state.slot.label === build.label ? state.slot.progress : 0 } };
};

export type ProductionAdvance = { state: ProductionQueueState; completed: ProductionBuild | null };

// Advances the single slot by `elapsedMs` of accrual at `ratePerDay`.
export const advanceProduction = (state: ProductionQueueState, ratePerDay: number, elapsedMs: number): ProductionAdvance => {
  if (!state.slot || ratePerDay <= 0 || elapsedMs <= 0) return { state, completed: null };
  const progress = state.slot.progress + (ratePerDay * elapsedMs) / MS_PER_DAY;
  if (progress >= state.slot.cost) {
    return { state: { slot: null }, completed: { ...state.slot, progress: state.slot.cost } };
  }
  return { state: { slot: { ...state.slot, progress } }, completed: null };
};
