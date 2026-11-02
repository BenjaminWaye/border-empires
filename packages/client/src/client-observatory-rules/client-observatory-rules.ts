import { aetherTowerMaxShots, OBSERVATORY_RANGE } from "@border-empires/shared";

import { afcEffectMultiplier } from "../client-afc-upgrades/client-afc-effect.js";
import type { DomainInfo, TechInfo } from "../client-types.js";

export type ObservatoryProgressionState = {
  techIds: string[];
  techCatalog: TechInfo[];
  domainIds: string[];
  domainCatalog: DomainInfo[];
};

const numericEffect = (
  effects: Record<string, unknown> | undefined,
  key: "observatoryRangeBonus"
): number => {
  const raw = effects?.[key];
  return typeof raw === "number" ? raw : 0;
};

const ownObservatoryRangeBonus = (state: ObservatoryProgressionState): number => {
  let bonus = 0;
  for (const techId of state.techIds) {
    const tech = state.techCatalog.find((entry) => entry.id === techId);
    bonus += numericEffect(tech?.effects, "observatoryRangeBonus");
  }
  for (const domainId of state.domainIds) {
    const domain = state.domainCatalog.find((entry) => entry.id === domainId);
    bonus += numericEffect(domain?.effects, "observatoryRangeBonus");
  }
  return bonus;
};

/**
 * Effective observatory range for the local player: base OBSERVATORY_RANGE (20) plus
 * the sum of observatoryRangeBonus from all unlocked techs and domains. This single value
 * governs both crystal action casting range and the protection field radius.
 *
 * For enemy observatories use the raw OBSERVATORY_PROTECTION_RADIUS constant — you
 * cannot know an enemy player's tech progression.
 */
export const ownObservatoryRange = (state: ObservatoryProgressionState): number =>
  OBSERVATORY_RANGE + ownObservatoryRangeBonus(state);

/**
 * Shots each of the local player's Aether Towers holds per 24h: base 3 times
 * every owned domain's observatoryShotsMult -- AFC upgrades (Resonance
 * Governor ×2) and legacy domain-tree entries (Hidden Hand ×2, Oracle State
 * ×1.5) alike, matching the simulation's multiplicativeEffectForPlayer.
 */
export const ownObservatoryMaxShots = (state: {
  readonly domainIds?: readonly string[] | undefined;
  readonly domainCatalog?: readonly Pick<DomainInfo, "id" | "effects">[] | undefined;
}): number => {
  let multiplier = 1;
  for (const domainId of state.domainIds ?? []) {
    const legacy = state.domainCatalog?.find((entry) => entry.id === domainId)?.effects?.observatoryShotsMult;
    multiplier *= typeof legacy === "number" && legacy > 0 ? legacy : afcEffectMultiplier([domainId], "observatoryShotsMult");
  }
  return aetherTowerMaxShots(multiplier);
};
