import { AFC_SPECIALIZATIONS, AFC_SPECIALIZATION_RULESET, type AfcSpecializationRuleset } from "./afc-specializations-catalog.js";
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
  momentumMaxStacks: 3, momentumIdleMs: 5 * 60_000, warDurationMs: 24 * 60 * 60_000,
  scarcityResourceOrder: ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"],
  forcedTruceDurationMs: 12 * 60 * 60_000, forcedTruceCooldownMs: 48 * 60 * 60_000
} as const;
export * from "./afc-campaign-state.js";
export * from "./afc-momentum.js";
export * from "./afc-tower-state.js";

export * from "./afc-structure-waiver.js";
