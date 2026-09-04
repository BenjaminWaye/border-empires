import {
  bestFortTierForTech,
  FORT_VARIANT_LABELS,
  nextFortTierForUpgrade,
  type FortTierInfo,
  bestSiegeTierForTech,
  nextSiegeTierForUpgrade,
  SIEGE_VARIANT_LABELS,
  type SiegeTierInfo,
  structureSlotRequirements,
  type SlotStructureType
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Extracted from client-tile-action-logic.ts (over the 500-line file-size
// limit) to keep that file from growing further.
//
// §5 (resource slots): tier.iron is the pre-rewrite stockpile amount --
// FortTierInfo/SiegeTierInfo are shared with legacy code paths, so it stays
// as-is, but the real cost display and affordability check now come from
// structureSlotRequirements(tier.variant) (§14.3).
const slotRequirementSummaryParts = (type: SlotStructureType): string[] =>
  structureSlotRequirements(type).map((r) => `${r.count} ${r.resource} slot${r.count === 1 ? "" : "s"}`);

export type FortVariantAction = { label: string; variant: FortTierInfo["variant"]; gold: number; defenseMult: number; summary: string };

const fortActionFromTier = (tier: FortTierInfo): FortVariantAction => ({
  label: FORT_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  defenseMult: tier.defenseMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`,
    ...slotRequirementSummaryParts(tier.variant)
  ].join(" + "),
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

export type SiegeVariantAction = { label: string; variant: SiegeTierInfo["variant"]; gold: number; attackMult: number; summary: string };

const siegeActionFromTier = (tier: SiegeTierInfo): SiegeVariantAction => ({
  label: SIEGE_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  attackMult: tier.attackMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`,
    ...slotRequirementSummaryParts(tier.variant)
  ].join(" + "),
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
