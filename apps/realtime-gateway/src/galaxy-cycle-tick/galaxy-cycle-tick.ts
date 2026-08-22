import type { GalaxySpecialization } from "@border-empires/sim-protocol";

// Galactic meta-layer v1 (docs/galactic-campaign-design.md §4/§7/§9/§13):
// pure per-Cycle economy tick for a single empire (one authUid). Kept
// side-effect-free and dependency-free on purpose — the scheduler/store
// wiring around this is a thin shim (galaxy-cycle-scheduler), per this
// repo's usual pattern of keeping business logic pure and separately
// testable (see global-status-broadcast-scheduler for the analogous split).
//
// JUDGMENT CALL: Cycle length is "weekly", per §14's open question between
// the doc's original "monthly" proposal and the review pass's (§15)
// recommendation of "weekly" as closer to season cadence and more
// implementable/testable. This constant is the sole source of truth for
// Cycle length; the scheduler wiring imports it rather than hardcoding a
// duplicate interval.
export const GALAXY_CYCLE_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

export type GalaxyHeldTerritory = {
  seasonId: string;
  tier: "PLANET" | "OUTPOST";
  specialization: GalaxySpecialization;
  // Current Stability (0-100) for this territory before the tick is applied.
  stability: number;
};

export type GalaxyEconomyTickState = {
  influence: number;
  // JUDGMENT CALL: Production has no debt concept in the doc (unlike
  // Influence, which explicitly supports a deficit, §4/§7) so it floors at
  // 0 here rather than going negative.
  production: number;
  territories: GalaxyHeldTerritory[];
};

export type GalaxyEconomyTickResult = {
  influence: number;
  production: number;
  // Stability for every input territory, in the same order, after this
  // tick's drain/recovery has been applied.
  territories: GalaxyHeldTerritory[];
};

// §13 Trickle table: [Inf, Prod] per Cycle, Planet and Outpost tiers.
const TRICKLE: Record<GalaxySpecialization, { planet: [number, number]; outpost: [number, number] }> = {
  CAPITAL: { planet: [6, 8], outpost: [2, 3] },
  TRADE: { planet: [6, 8], outpost: [2, 3] },
  INDUSTRIAL: { planet: [2, 24], outpost: [1, 8] },
  EXTRACTION: { planet: [2, 24], outpost: [1, 8] },
  LOGISTICS: { planet: [4, 16], outpost: [1, 5] }
};

// §13 Influence upkeep: 3 Inf for the 1st-3rd held Planet, then +1 per
// additional Planet (4th=4, 5th=5, ...). Outposts carry 0 upkeep (§4).
const planetUpkeepCost = (planetIndex: number): number => (planetIndex < 3 ? 3 : planetIndex + 1);

const DEFICIT_DRAIN_PER_CYCLE = 8;
const RECOVERY_PER_CYCLE = 15;
const STABILITY_MAX = 100;
const STABILITY_MIN = 0;

const applyOneCycle = (state: GalaxyEconomyTickState): GalaxyEconomyTickState => {
  let influence = state.influence;
  let production = state.production;

  let planetIndex = 0;
  for (const territory of state.territories) {
    const trickle = TRICKLE[territory.specialization];
    const [inf, prod] = territory.tier === "PLANET" ? trickle.planet : trickle.outpost;
    influence += inf;
    production += prod;
    if (territory.tier === "PLANET") {
      influence -= planetUpkeepCost(planetIndex);
      planetIndex += 1;
    }
  }

  // §7 "Deficit drains one Sector at a time": while net Influence for this
  // Cycle is negative, drain applies only to the single lowest-Stability
  // held territory, not all of them. While net Influence is positive, all
  // held territories recover, capped at 100. Net-zero does neither.
  let territories = state.territories;
  if (territories.length > 0) {
    if (influence < 0) {
      let lowestIdx = 0;
      let lowestStability = territories[0]?.stability ?? 0;
      for (let i = 1; i < territories.length; i++) {
        const stability = territories[i]?.stability ?? 0;
        if (stability < lowestStability) {
          lowestIdx = i;
          lowestStability = stability;
        }
      }
      territories = territories.map((t, i) =>
        i === lowestIdx ? { ...t, stability: Math.max(STABILITY_MIN, t.stability - DEFICIT_DRAIN_PER_CYCLE) } : t
      );
    } else if (influence > 0) {
      territories = territories.map((t) => ({ ...t, stability: Math.min(STABILITY_MAX, t.stability + RECOVERY_PER_CYCLE) }));
    }
  }

  production = Math.max(0, production);

  return { influence, production, territories };
};

// Applies `cyclesElapsed` whole Cycles of trickle/upkeep/Stability to a
// single empire's economy state. cyclesElapsed <= 0 is a no-op (returns the
// input territories/balances unchanged) — callers are expected to only
// invoke this once at least one Cycle has actually elapsed since the last
// processed tick.
export const computeGalaxyCycleTick = (
  state: GalaxyEconomyTickState,
  cyclesElapsed: number
): GalaxyEconomyTickResult => {
  let next: GalaxyEconomyTickState = state;
  const wholeCycles = Math.max(0, Math.floor(cyclesElapsed));
  for (let i = 0; i < wholeCycles; i++) {
    next = applyOneCycle(next);
  }
  return { influence: next.influence, production: next.production, territories: next.territories };
};

// JUDGMENT CALL: newly-claimed territory starts at Stability 100 — the doc
// doesn't state this explicitly (§7), but it's the sensible default for
// "just won/awarded, nothing has drained it yet".
export const NEW_TERRITORY_STARTING_STABILITY = 100;
