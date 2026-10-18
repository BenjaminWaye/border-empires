import { AFC_SPECIALIZATIONS, type AfcSpecializationEffects } from "@border-empires/shared";
export function afcEffectMultiplier(domainIds: readonly string[] | undefined, key: keyof AfcSpecializationEffects): number {
  let multiplier = 1;
  for (const upgrade of AFC_SPECIALIZATIONS) if (domainIds?.includes(upgrade.id)) {
    const effects: AfcSpecializationEffects = upgrade.effects;
    const value = effects[key];
    if (typeof value === "number") multiplier *= value;
  }
  return multiplier;
}
