import {
  INTEGRITY_ECON_MIN_MULT,
  INTEGRITY_ECON_MAX_MULT,
  INTEGRITY_GROWTH_MIN_MULT,
  INTEGRITY_GROWTH_MAX_MULT
} from "./config.js";
import { FORT_TIER_LADDER } from "./structure-costs/structure-costs.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const lerpByIntegrity = (t: number, min: number, max: number): number => min + t * (max - min);

/**
 * Local-support model (docs/manpower-economy-rewrite-plan.md §7.2,
 * docs/defense-consolidation-exploration.md §3.1): each settled tile's
 * support is base + friendly-settled-neighbour support + garrison, out of a
 * max of 4 "sides" — the same 4-neighbour convention already used by
 * exposure.ts/player-defensibility-metrics.ts. This replaces the old global
 * defensibilityScore(T,E) alias, which compared total perimeter against an
 * ideal blob and parked every realistic empire near ~50% regardless of
 * actual shape (docs/defense-consolidation-exploration.md §2).
 */
export const LOCAL_SUPPORT_MAX_SIDES = 4;

/** Flat garrison contribution from an active town on the tile. */
export const TOWN_GARRISON_BONUS = 1;

/**
 * Garrison contribution from an active fort, scaled off its defenseMult so
 * that a THUNDER_BASTION alone can fully secure an otherwise-unsupported
 * tile (defenseMult / THUNDER_BASTION's defenseMult * max sides). Derived
 * from FORT_TIER_LADDER (the single source of truth for fort tiers,
 * structure-costs.ts) rather than a second hand-authored table.
 */
export const garrisonBonusForFortDefenseMult = (defenseMult: number): number =>
  (defenseMult / FORT_TIER_LADDER.THUNDER_BASTION.defenseMult) * LOCAL_SUPPORT_MAX_SIDES;

/** Per-tile local support ratio in [0,1]: (supported sides + garrison) / 4. */
export const localSupportRatioForTile = (supportedSides: number, garrisonBonus: number): number =>
  clamp((supportedSides + garrisonBonus) / LOCAL_SUPPORT_MAX_SIDES, 0, 1);

/**
 * The empire integrity value fed into integrityEconomyMult/integrityGrowthMult.
 * Takes the player's already-aggregated local support score (average of
 * localSupportRatioForTile across their settled tiles, computed in
 * apps/simulation/src/player-defensibility-metrics.ts) and defensively
 * clamps it — the aggregate is already in [0,1] by construction, but a
 * clamp keeps this function meaningful as the canonical "empire integrity"
 * entry point even if a future caller's input isn't pre-clamped.
 */
export const empireIntegrity = (localSupportScore: number): number => clamp(localSupportScore, 0, 1);

export const integrityEconomyMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_ECON_MIN_MULT, INTEGRITY_ECON_MAX_MULT);

export const integrityGrowthMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_GROWTH_MIN_MULT, INTEGRITY_GROWTH_MAX_MULT);
