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

// §26 MVP trickle: [Inf, Prod] per Cycle. Production is no longer a weekly
// wallet trickle -- it is a daily rate feeding the one build slot (§21.8,
// galaxy-duke-engine.ts) -- so the Prod column is 0 here and only Influence
// accrues on the Cycle tick. Influence: Capital/Trade 4, Logistics 3,
// Industrial/Extraction 2, so a lone Planet nets 0 or better once upkeep
// (below) is paid.
const TRICKLE: Record<GalaxySpecialization, { planet: [number, number]; outpost: [number, number] }> = {
  CAPITAL: { planet: [4, 0], outpost: [2, 0] },
  TRADE: { planet: [4, 0], outpost: [2, 0] },
  INDUSTRIAL: { planet: [2, 0], outpost: [1, 0] },
  EXTRACTION: { planet: [2, 0], outpost: [1, 0] },
  LOGISTICS: { planet: [3, 0], outpost: [1, 0] }
};

// §26 Influence upkeep: 2, 2, 3 for the 1st-3rd held Planet, then +1 per
// additional Planet (4th=4, 5th=5, ...). Outposts carry 0 upkeep (§4).
const planetUpkeepCost = (planetIndex: number): number => (planetIndex < 2 ? 2 : planetIndex === 2 ? 3 : planetIndex + 1);

const DEFICIT_DRAIN_PER_CYCLE = 8;
const RECOVERY_PER_CYCLE = 15;
const STABILITY_MAX = 100;
const STABILITY_MIN = 0;

// JUDGMENT CALL (§13/§5): the Senate table gives EMBARGO's cost/quorum/
// duration/cooldown but not its actual trickle-reduction magnitude. 50% is
// a "meaningfully punishing, not devastating" starting point pending
// playtesting. Lives here (not in galaxy-senate-tick.ts, which decides
// *whether* an Embargo is active) since this is the module that actually
// applies it and the two would otherwise import each other.
export const EMBARGO_TRICKLE_MULTIPLIER = 0.5;

// §5/§13: a passed EMBARGO Sanction (galaxy-senate-tick.ts) reduces the
// target's trickle for the sanction's duration. Applied uniformly across
// every elapsed Cycle in one computeGalaxyCycleTick call rather than
// per-Cycle -- a JUDGMENT CALL, since a single call can span multiple
// elapsed Cycles (a long-offline empire) and an Embargo could technically
// expire partway through that span. Cycles elapsing in a single batch like
// that is the rare case (the scheduler polls hourly against a weekly
// Cycle), so the imprecision is acceptable rather than worth threading a
// per-Cycle expiry check through this loop.
const applyOneCycle = (state: GalaxyEconomyTickState, embargoActive: boolean): GalaxyEconomyTickState => {
  let influence = state.influence;
  let production = state.production;
  const trickleMultiplier = embargoActive ? EMBARGO_TRICKLE_MULTIPLIER : 1;

  let planetIndex = 0;
  for (const territory of state.territories) {
    const trickle = TRICKLE[territory.specialization];
    const [inf, prod] = territory.tier === "PLANET" ? trickle.planet : trickle.outpost;
    influence += inf * trickleMultiplier;
    production += prod * trickleMultiplier;
    if (territory.tier === "PLANET") {
      influence -= planetUpkeepCost(planetIndex);
      planetIndex += 1;
    }
  }

  // §7 "Deficit drains one Sector at a time": while net Influence for this
  // Cycle is negative, drain applies only to the single lowest-Stability
  // held territory, not all of them. While the balance is zero or above
  // (§26: a lone Industrial Planet nets exactly 0 and must still heal), all
  // held territories recover, capped at 100.
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
    } else {
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
  cyclesElapsed: number,
  embargoActive = false
): GalaxyEconomyTickResult => {
  let next: GalaxyEconomyTickState = state;
  const wholeCycles = Math.max(0, Math.floor(cyclesElapsed));
  for (let i = 0; i < wholeCycles; i++) {
    next = applyOneCycle(next, embargoActive);
  }
  return { influence: next.influence, production: next.production, territories: next.territories };
};

// JUDGMENT CALL: newly-claimed territory starts at Stability 100 — the doc
// doesn't state this explicitly (§7), but it's the sensible default for
// "just won/awarded, nothing has drained it yet".
export const NEW_TERRITORY_STARTING_STABILITY = 100;
