import { AFC_SPECIALIZATIONS, AFC_SPECIALIZATION_RULESET, type AfcSpecializationEffects, type AfcSpecializationRuleset } from "./afc-specializations-catalog.js";
export * from "./afc-specializations-catalog.js";

export interface AfcProgressionState {
  readonly afcUpgradeRuleset?: AfcSpecializationRuleset;
  readonly techIds: Iterable<string>;
  readonly domainIds?: Iterable<string>;
}
export interface AfcTechTier { readonly id: string; readonly tier: number }
export const usesAfcSpecializations = (state: Pick<AfcProgressionState, "afcUpgradeRuleset" | "domainIds">): boolean =>
  state.afcUpgradeRuleset === AFC_SPECIALIZATION_RULESET || [...(state.domainIds ?? [])].some(id => id.startsWith("afc-"));

/** One choice at the lowest unfilled commissioned tier; skipped tech tiers bank earlier picks. */
export function afcSpecializationProgress(state: AfcProgressionState, techs: Iterable<AfcTechTier>): {
  unlockedTier: number; nextTier: number | undefined; choices: string[];
} {
  const ownedTechs = new Set(state.techIds);
  let unlockedTier = 0;
  for (const tech of techs) if (ownedTechs.has(tech.id)) unlockedTier = Math.max(unlockedTier, Math.min(5, tech.tier));
  const selectedIds = new Set(state.domainIds ?? []);
  const filled = new Set(AFC_SPECIALIZATIONS.filter(upgrade => selectedIds.has(upgrade.id)).map(upgrade => upgrade.tier));
  const nextTier = ([1, 2, 3, 4, 5] as const).find(tier => !filled.has(tier));
  const choices = nextTier !== undefined && nextTier <= unlockedTier
    ? AFC_SPECIALIZATIONS.filter(upgrade => upgrade.tier === nextTier).map(upgrade => upgrade.id) : [];
  return { unlockedTier, nextTier, choices };
}

export const AFC_SPECIALIZATION_BALANCE = {
  momentumMaxStacks: 5, momentumIdleMs: 5 * 60_000,
  truceIncomeShareMax: 0.5, alliedLevyMaxAllies: 3,
  hijackTakeoverMs: 10 * 60_000, hijackCooldownMs: 24 * 60 * 60_000,
  scarcityResourceOrder: ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"],
  forcedTruceDurationMs: 12 * 60 * 60_000, forcedTruceCooldownMs: 48 * 60 * 60_000
} as const;
export * from "./afc-campaign-state.js";
export * from "./afc-momentum.js";
export * from "./afc-tower-state.js";

export * from "./afc-structure-waiver.js";
/** Battlefield Momentum's attack bonus per stack, read from the catalogue so previews never drift. */
export const AFC_MOMENTUM_ATTACK_PER_STACK: number = AFC_SPECIALIZATIONS.find(upgrade => upgrade.id === "afc-vanguard-3")?.effects.flagMomentumAttackPerStack ?? 0;
/** Expansion Doctrine (AFC Dominion IV): EXPAND is priced as if the House held `mult` × its frontier tiles. */
export const afcExpandPricingFrontierCount = (frontierTileCount: number, mult: number): number =>
  Math.floor(Math.max(0, frontierTileCount) * Math.min(1, Math.max(0, mult)));
/** Sum of one AFC effect across the installed picks (services that only see domain ids, e.g. the gateway). */
export const afcAdditiveEffect = (domainIds: Iterable<string> | undefined, key: keyof AfcSpecializationEffects): number => {
  const installed = new Set(domainIds ?? []);
  let total = 0;
  for (const upgrade of AFC_SPECIALIZATIONS) {
    const effects: AfcSpecializationEffects = upgrade.effects;
    const value = effects[key];
    if (installed.has(upgrade.id) && typeof value === "number") total += value;
  }
  return total;
};
/** Product of one AFC multiplier effect across the installed picks (1 when none applies). */
export const afcMultiplicativeEffect = (domainIds: Iterable<string> | undefined, key: keyof AfcSpecializationEffects): number => {
  const installed = new Set(domainIds ?? []);
  let product = 1;
  for (const upgrade of AFC_SPECIALIZATIONS) {
    const effects: AfcSpecializationEffects = upgrade.effects;
    const value = effects[key];
    if (installed.has(upgrade.id) && typeof value === "number" && value > 0) product *= value;
  }
  return product;
};
/** Economic Hegemony's required lead over the runner-up: Metropolitan Concession (AFC Exchequer V) lowers it for its holder. */
export const economicHegemonyLeadMultFor = (domainIds: Iterable<string> | undefined, defaultLeadMult: number): number => {
  const afcLead = afcMultiplicativeEffect(domainIds, "economicHegemonyLeadMult");
  return afcLead === 1 ? defaultLeadMult : Math.min(defaultLeadMult, afcLead);
};
