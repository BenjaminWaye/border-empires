import {
  bestFortTierForTech,
  FORT_VARIANT_LABELS,
  nextFortTierForUpgrade,
  type FortTierInfo,
  bestSiegeTierForTech,
  nextSiegeTierForUpgrade,
  SIEGE_VARIANT_LABELS,
  type SiegeTierInfo
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";

// Extracted from client-tile-action-logic.ts (over the 500-line file-size
// limit) to keep that file from growing further.
//
// §5 (resource slots): tier.iron is the pre-rewrite stockpile amount --
// FortTierInfo/SiegeTierInfo are shared with legacy code paths, so it stays
// as-is, but the real ongoing cost (§14.3's slot requirement) comes from the
// shared upkeepSuffixFor helper instead -- a labeled "Upkeep: ..." segment,
// not folded unlabeled into `summary`.
export type FortVariantAction = { label: string; variant: FortTierInfo["variant"]; gold: number; defenseMult: number; summary: string; upkeepSuffix: string };

const fortActionFromTier = (tier: FortTierInfo): FortVariantAction => ({
  label: FORT_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  defenseMult: tier.defenseMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`
  ].join(" + "),
  upkeepSuffix: upkeepSuffixFor(tier.variant)
});

const fortBuildVariantForState = (state: ClientState): FortVariantAction =>
  fortActionFromTier(bestFortTierForTech((id) => state.techIds.includes(id)));

export const nextFortVariantForTile = (
  state: ClientState,
  tile: Tile,
): FortVariantAction | undefined => {
  if (tile.fort) {
    const result = nextFortTierForUpgrade(tile.fort.variant, (id) => state.techIds.includes(id));
    return result ? fortActionFromTier(result) : undefined;
  }
  return fortBuildVariantForState(state);
};

export type SiegeVariantAction = { label: string; variant: SiegeTierInfo["variant"]; gold: number; attackMult: number; summary: string; upkeepSuffix: string };

const siegeActionFromTier = (tier: SiegeTierInfo): SiegeVariantAction => ({
  label: SIEGE_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  attackMult: tier.attackMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`
  ].join(" + "),
  upkeepSuffix: upkeepSuffixFor(tier.variant)
});

const siegeBuildVariantForState = (state: ClientState): SiegeVariantAction =>
  siegeActionFromTier(bestSiegeTierForTech((id) => state.techIds.includes(id)));

export const nextSiegeVariantForTile = (
  state: ClientState,
  tile: Tile,
): SiegeVariantAction | undefined => {
  if (tile.siegeOutpost) {
    const result = nextSiegeTierForUpgrade(tile.siegeOutpost.variant, (id) => state.techIds.includes(id));
    return result ? siegeActionFromTier(result) : undefined;
  }
  return siegeBuildVariantForState(state);
};
