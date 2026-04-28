import type { DomainInfo, TechInfo } from "./client-types.js";

const BASE_OBSERVATORY_CAST_RADIUS = 30;
const BASE_OBSERVATORY_PROTECTION_RADIUS = 10;

type ObservatoryProgressionState = {
  techIds: string[];
  techCatalog: TechInfo[];
  domainIds: string[];
  domainCatalog: DomainInfo[];
};

const ownObservatoryBonus = (
  state: ObservatoryProgressionState,
  effectKey: "observatoryCastRadiusBonus" | "observatoryProtectionRadiusBonus"
): number => {
  let bonus = 0;
  for (const techId of state.techIds) {
    const tech = state.techCatalog.find((entry) => entry.id === techId);
    const raw = tech?.effects?.[effectKey];
    if (typeof raw === "number") bonus += raw;
  }
  for (const domainId of state.domainIds) {
    const domain = state.domainCatalog.find((entry) => entry.id === domainId);
    const raw = domain?.effects?.[effectKey];
    if (typeof raw === "number") bonus += raw;
  }
  return bonus;
};

export const ownObservatoryCastRadius = (
  state: ObservatoryProgressionState
): number => BASE_OBSERVATORY_CAST_RADIUS + ownObservatoryBonus(state, "observatoryCastRadiusBonus");

export const ownObservatoryProtectionRadius = (
  state: ObservatoryProgressionState
): number => BASE_OBSERVATORY_PROTECTION_RADIUS + ownObservatoryBonus(state, "observatoryProtectionRadiusBonus");
