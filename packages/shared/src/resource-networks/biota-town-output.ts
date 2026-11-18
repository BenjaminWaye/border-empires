import type { PopulationTier } from "../types.js";
import { terrainAdjustedTownManpower, type TownTerrainProfileId } from "../town-terrain-profile.js";

// Partial luxury biota: a City, Great City or Metropolis short of its biota
// need gives output between a Town's (nothing met) and its own tier's (all
// met), in proportion to the share of its need that is met. Applies to its
// manpower cap, manpower regen and Coin (frontier-resource-effects.ts).

type BiotaNeed = { readonly received: number; readonly needed: number };

/** Share of a town's biota need that is met, 0–1; 1 when it needs none or has no record. */
export const biotaShareMet = (supply: BiotaNeed | undefined): number =>
  !supply || supply.needed <= 0 ? 1 : Math.max(0, Math.min(1, supply.received / supply.needed));

/** Town-level value plus the share met of the gap up to the town's own tier value. */
export const biotaBlend = (townValue: number, fullValue: number, share: number): number => townValue + (fullValue - townValue) * share;

/** A town's manpower after its biota share; equal to terrainAdjustedTownManpower when fully supplied. */
export const biotaAdjustedTownManpower = (
  tier: PopulationTier,
  profile: TownTerrainProfileId | undefined,
  coastal: boolean | undefined,
  supply: BiotaNeed | undefined
): { cap: number; regenPerMinute: number } => {
  const full = terrainAdjustedTownManpower(tier, profile, coastal);
  const share = biotaShareMet(supply);
  if (share >= 1) return full;
  const town = terrainAdjustedTownManpower("TOWN", profile, coastal);
  return { cap: biotaBlend(town.cap, full.cap, share), regenPerMinute: biotaBlend(town.regenPerMinute, full.regenPerMinute, share) };
};
