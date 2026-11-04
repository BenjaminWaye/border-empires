// Build menus show the manpower a build will actually charge: the base cost
// lowered by the player's AFC manpower discounts, using the same structure ->
// effect rule and rounding the simulation charges with
// (structureManpowerCostEffectKey / discountedStructureManpowerCost in shared,
// structureManpowerCostForPlayer in apps/simulation).
import { discountedStructureManpowerCost, structureManpowerCostEffectKey } from "@border-empires/shared";
import type { BuildSpeedState } from "../client-build-speed/client-build-speed.js";

const effectMultForState = (state: BuildSpeedState, key: string): number => {
  const techIds = new Set(state.techIds);
  const domainIds = new Set(state.domainIds);
  let mult = 1;
  const apply = (effects: Record<string, unknown> | undefined): void => {
    const value = effects?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) mult *= value;
  };
  for (const tech of state.techCatalog) if (techIds.has(tech.id)) apply(tech.effects);
  for (const domain of state.domainCatalog) if (domainIds.has(domain.id)) apply(domain.effects);
  return mult;
};

/** `baseCost` manpower for building `structureType` after the player's discounts. */
export const structureManpowerCostForState = (state: BuildSpeedState, structureType: string, baseCost: number): number => {
  const key = structureManpowerCostEffectKey(structureType);
  const mult = effectMultForState(state, "structureBuildManpowerCostMult") * (key ? effectMultForState(state, key) : 1);
  return discountedStructureManpowerCost(baseCost, mult);
};
