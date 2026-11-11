import {
  FORT_VARIANT_LABELS,
  fortTierForBuild,
  type FortTierInfo,
  bestSiegeTierForTech,
  nextSiegeTierForUpgrade,
  siegeTierForFreshBuild,
  SIEGE_VARIANT_LABELS,
  type SiegeTierInfo,
  afcAdditiveEffect
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { afcModuleInstalled } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import { hasFreeResourceSlots } from "./client-resource-slot-gate.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";

// Extracted from client-tile-action-logic.ts (over the 500-line file-size
// limit) to keep that file from growing further.
//
// §5 (resource slots): tier.iron is the pre-rewrite stockpile amount --
// FortTierInfo/SiegeTierInfo are shared with legacy code paths, so it stays
// as-is, but the real ongoing cost (§14.3's slot requirement) comes from the
// shared upkeepSuffixFor helper instead -- a labeled "Upkeep: ..." segment,
// not folded unlabeled into `summary`.
export type FortVariantAction = { label: string; variant: FortTierInfo["variant"]; gold: number; defenseMult: number; summary: string; upkeepSuffix: string };

/** Fortification Patterns (AFC Bastion II): a fresh Fort (bare ground or over a Palisade) is free until the grant is used. */
export const freeFortAvailable = (state: Pick<ClientState, "domainIds" | "freeFortsUsed">, variant: string, currentVariant: string | undefined): boolean =>
  variant !== "PALISADE" && (!currentVariant || currentVariant === "PALISADE") && state.freeFortsUsed < afcAdditiveEffect(state.domainIds, "freeFortCount");
/** The Titanium Forge Module: the AFC module that gates every Fort tier. */
export const FORT_MODULE_TECH_ID = "masonry";
/** Fortification Patterns also lets a House build Forts without researching the Titanium Forge Module (a copy must still be installed: fortModuleReady). */
export const hasFortTech = (state: Pick<ClientState, "techIds" | "domainIds">): boolean =>
  state.techIds.includes(FORT_MODULE_TECH_ID) || afcAdditiveEffect(state.domainIds, "fortTechWaiver") > 0;
/**
 * Whether the Fort row can actually be offered: masonry is the Titanium Forge
 * AFC module, so a copy must sit on an active AFC -- the menu filter hides the
 * Fort row otherwise, and the server rejects the build. Fortification Patterns
 * waives owning the tech, not the installed module.
 */
export const fortModuleReady = (state: Pick<ClientState, "techIds" | "domainIds" | "tiles" | "me">): boolean =>
  hasFortTech(state) && afcModuleInstalled(state, FORT_MODULE_TECH_ID);

const fortActionFromTier = (state: ClientState, tier: FortTierInfo, free = false): FortVariantAction => ({
  label: FORT_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  defenseMult: tier.defenseMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} coin`] : []),
    free ? "free (Fortification Patterns)" : `${structureManpowerCostForState(state, tier.variant, tier.manpower)} manpower`
  ].join(" + "),
  upkeepSuffix: upkeepSuffixFor(tier.variant)
});

// Mirrors the server's fortTierForBuild: a fresh fort or one built over a
// Palisade goes to the best tier the tech allows; a real fort climbs one tier.
export const nextFortVariantForTile = (
  state: ClientState,
  tile: Tile,
): FortVariantAction | undefined => {
  const result = fortTierForBuild("FORT", tile.fort?.variant, (id) => state.techIds.includes(id));
  return result ? fortActionFromTier(state, result, freeFortAvailable(state, result.variant, tile.fort?.variant)) : undefined;
};

export type SiegeVariantAction = { label: string; variant: SiegeTierInfo["variant"]; gold: number; attackMult: number; summary: string; upkeepSuffix: string };

const siegeActionFromTier = (state: ClientState, tier: SiegeTierInfo): SiegeVariantAction => ({
  label: SIEGE_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  attackMult: tier.attackMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} coin`] : []),
    `${structureManpowerCostForState(state, tier.variant, tier.manpower)} manpower`
  ].join(" + "),
  upkeepSuffix: upkeepSuffixFor(tier.variant)
});

// Mirrors the server's siegeTierForFreshBuild: a fresh siege build goes to
// the best tier the tech allows whose UMBRITE slots fit, so a player who
// can't cover a Siege Tower is offered a Siege Battery instead.
const siegeBuildVariantForState = (state: ClientState): SiegeVariantAction =>
  siegeActionFromTier(state, siegeTierForFreshBuild((id) => state.techIds.includes(id), (variant) => hasFreeResourceSlots(state, variant)));

// The tier the tech alone would build on a fresh tile -- differs from
// nextSiegeVariantForTile's pick only when that pick stepped down for slots.
export const bestSiegeVariantForTech = (state: ClientState): SiegeTierInfo["variant"] =>
  bestSiegeTierForTech((id) => state.techIds.includes(id)).variant;

export const nextSiegeVariantForTile = (
  state: ClientState,
  tile: Tile,
): SiegeVariantAction | undefined => {
  if (tile.siegeBattery) {
    const result = nextSiegeTierForUpgrade(tile.siegeBattery.variant, (id) => state.techIds.includes(id));
    return result ? siegeActionFromTier(state, result) : undefined;
  }
  return siegeBuildVariantForState(state);
};
