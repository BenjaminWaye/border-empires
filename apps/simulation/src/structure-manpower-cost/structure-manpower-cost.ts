import type { DomainPlayer } from "@border-empires/game-domain";
import { MONUMENT_UNLOCK_TECH_ID, discountedStructureManpowerCost, structureManpowerCostEffectKey } from "@border-empires/shared";
import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

type EffectPlayer = Pick<DomainPlayer, "techIds" | "domainIds">;

/** The player's AFC manpower-discount multiplier for building `structureType` (1 = full price). */
export const structureManpowerCostMultForPlayer = (player: EffectPlayer, structureType: string): number => {
  const key = structureManpowerCostEffectKey(structureType);
  return multiplicativeEffectForPlayer(player, "structureBuildManpowerCostMult") *
    (key ? multiplicativeEffectForPlayer(player, key) : 1);
};

/**
 * `baseCost` after the player's manpower discounts. The build charge, the
 * dev-queue reservation and the cancel refund all go through this so a
 * cancelled build refunds exactly what it was charged.
 */
export const structureManpowerCostForPlayer = (player: EffectPlayer, structureType: string, baseCost: number): number =>
  discountedStructureManpowerCost(baseCost, structureManpowerCostMultForPlayer(player, structureType));

/**
 * Manpower a fort-family build charges, and whether it used one of Fortification Patterns' (AFC Bastion II)
 * free Forts: a fresh Fort (bare ground or over a Palisade) is free until the House has built its grant.
 * Upgrades and Palisades always pay the discounted price.
 */
export const fortBuildManpowerCharge = (
  player: EffectPlayer & { afcCampaign?: { freeFortsUsed?: number } | undefined }, variant: string, currentVariant: string | undefined, baseCost: number
): { manpower: number; freeFort: boolean } => {
  const fresh = variant !== "PALISADE" && (!currentVariant || currentVariant === "PALISADE");
  if (fresh && (player.afcCampaign?.freeFortsUsed ?? 0) < additiveEffectForPlayer(player, "freeFortCount")) return { manpower: 0, freeFort: true };
  return { manpower: structureManpowerCostForPlayer(player, variant, baseCost), freeFort: false };
};
/** Fortification Patterns (AFC Bastion II) lets a House build Forts without the Titanium Forge Module. */
export const fortTechWaived = (player: EffectPlayer, techId: string): boolean =>
  techId === "masonry" && additiveEffectForPlayer(player, "fortTechWaiver") > 0;
/** Relay Fabrication Line makes Relays instant; Universal Fabrication Line makes every non-monument build instant. */
export const afcInstantBuild = (player: EffectPlayer, structureType: string): boolean =>
  (structureType === "RELAY_BEACON" && additiveEffectForPlayer(player, "relayBeaconInstantBuild") > 0) ||
  (!(structureType in MONUMENT_UNLOCK_TECH_ID) && additiveEffectForPlayer(player, "instantStructureBuild") > 0);
