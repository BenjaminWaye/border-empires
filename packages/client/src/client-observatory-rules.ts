import { OBSERVATORY_CAST_RADIUS, OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/shared";

import type { DomainInfo, TechInfo } from "./client-types.js";

const BASE_OBSERVATORY_CAST_RADIUS = OBSERVATORY_CAST_RADIUS;
const BASE_OBSERVATORY_PROTECTION_RADIUS = OBSERVATORY_PROTECTION_RADIUS;

type ObservatoryProgressionState = {
  techIds: string[];
  techCatalog: TechInfo[];
  domainIds: string[];
  domainCatalog: DomainInfo[];
};

const numericEffect = (
  effects: Record<string, unknown> | undefined,
  key: "observatoryRangeBonus" | "observatoryCastRadiusBonus" | "observatoryProtectionRadiusBonus"
): number => {
  const raw = effects?.[key];
  return typeof raw === "number" ? raw : 0;
};

const ownObservatoryBonus = (
  state: ObservatoryProgressionState,
  effectKey: "observatoryCastRadiusBonus" | "observatoryProtectionRadiusBonus"
): number => {
  let bonus = 0;
  for (const techId of state.techIds) {
    const tech = state.techCatalog.find((entry) => entry.id === techId);
    bonus += numericEffect(tech?.effects, "observatoryRangeBonus");
    bonus += numericEffect(tech?.effects, effectKey);
  }
  for (const domainId of state.domainIds) {
    const domain = state.domainCatalog.find((entry) => entry.id === domainId);
    bonus += numericEffect(domain?.effects, "observatoryRangeBonus");
    bonus += numericEffect(domain?.effects, effectKey);
  }
  return bonus;
};

export const ownObservatoryCastRadius = (
  state: ObservatoryProgressionState
): number => BASE_OBSERVATORY_CAST_RADIUS + ownObservatoryBonus(state, "observatoryCastRadiusBonus");

export const ownObservatoryProtectionRadius = (
  state: ObservatoryProgressionState
): number => BASE_OBSERVATORY_PROTECTION_RADIUS + ownObservatoryBonus(state, "observatoryProtectionRadiusBonus");
