import {
  FORT_DEFENSE_MULT,
  LIGHT_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_ATTACK_MULT,
  WOODEN_FORT_DEFENSE_MULT
} from "@border-empires/shared";

export const FORTIFIED_TILE_WITHOUT_OUTPOST_ATTACK_MULT = 0.35;

type FortDefenseMultiplierInput = {
  hasFort: boolean;
  hasWoodenFort: boolean;
  fortDefenseEffectsMult: number;
};

export const fortDefenseMultiplier = ({
  hasFort,
  hasWoodenFort,
  fortDefenseEffectsMult
}: FortDefenseMultiplierInput): number => {
  if (hasFort) return FORT_DEFENSE_MULT * fortDefenseEffectsMult;
  if (hasWoodenFort) return WOODEN_FORT_DEFENSE_MULT;
  return 1;
};

type OutpostAttackMultiplierInput = {
  hasSiegeOutpost: boolean;
  hasLightOutpost: boolean;
  outpostAttackEffectsMult: number;
};

export const outpostAttackMultiplier = ({
  hasSiegeOutpost,
  hasLightOutpost,
  outpostAttackEffectsMult
}: OutpostAttackMultiplierInput): number => {
  if (hasSiegeOutpost) return SIEGE_OUTPOST_ATTACK_MULT * outpostAttackEffectsMult;
  if (hasLightOutpost) return LIGHT_OUTPOST_ATTACK_MULT;
  return 1;
};

type FortifiedTargetAttackMultiplierInput = {
  targetHasFortification: boolean;
  originHasOutpost: boolean;
};

export const fortifiedTargetAttackMultiplier = ({
  targetHasFortification,
  originHasOutpost
}: FortifiedTargetAttackMultiplierInput): number => {
  if (!targetHasFortification || originHasOutpost) return 1;
  return FORTIFIED_TILE_WITHOUT_OUTPOST_ATTACK_MULT;
};
