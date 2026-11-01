import type { DomainPlayer } from "@border-empires/game-domain";
import { discountedStructureManpowerCost, structureManpowerCostEffectKey } from "@border-empires/shared";
import { multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

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
