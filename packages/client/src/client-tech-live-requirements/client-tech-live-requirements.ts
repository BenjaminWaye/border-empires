import type { ClientState } from "../client-state/client-state.js";

type ResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
const RESOURCE_KEYS: readonly ResourceKey[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"];

type Requirements = {
  gold: number;
  resources: Partial<Record<ResourceKey, number>>;
  checklist?: Array<{ label: string; met: boolean }>;
  canResearch?: boolean;
};

const buildChecklist = (
  requirements: Pick<Requirements, "gold" | "resources">,
  liveGold: number,
  liveResources: Record<ResourceKey, number>
): Array<{ label: string; met: boolean }> => {
  const out: Array<{ label: string; met: boolean }> = [];
  const goldCost = requirements.gold ?? 0;
  if (goldCost > 0) {
    out.push({ label: `Gold ${goldCost.toLocaleString()}`, met: liveGold >= goldCost });
  }
  for (const key of RESOURCE_KEYS) {
    const amount = requirements.resources?.[key] ?? 0;
    if (amount > 0) {
      out.push({ label: `${key} ${amount.toLocaleString()}`, met: (liveResources[key] ?? 0) >= amount });
    }
  }
  return out;
};

const techNameById = (state: Pick<ClientState, "techCatalog">): Map<string, string> =>
  new Map(state.techCatalog.map((tech) => [tech.id, tech.name]));

const isAffordable = (
  requirements: Pick<Requirements, "gold" | "resources">,
  liveGold: number,
  liveResources: Record<ResourceKey, number>
): boolean => {
  if ((requirements.gold ?? 0) > liveGold) return false;
  for (const key of RESOURCE_KEYS) {
    const need = requirements.resources?.[key] ?? 0;
    if (need > (liveResources[key] ?? 0)) return false;
  }
  return true;
};

export const refreshLiveTechRequirements = (state: ClientState): void => {
  const liveGold = state.gold;
  const liveResources = state.strategicResources;
  const techChoices = new Set(state.techChoices);
  const techNames = techNameById(state);
  for (const tech of state.techCatalog) {
    const prereqMet = techChoices.has(tech.id);
    const affordable = isAffordable(tech.requirements, liveGold, liveResources);
    tech.requirements.canResearch = prereqMet && affordable;
    tech.requirements.checklist = buildChecklist(tech.requirements, liveGold, liveResources);
  }
  const domainChoices = new Set(state.domainChoices);
  for (const domain of state.domainCatalog) {
    const prereqMet = domainChoices.has(domain.id);
    const techMet = state.techIds.includes(domain.requiresTechId);
    const affordable = isAffordable(domain.requirements, liveGold, liveResources);
    domain.requirements.canResearch = prereqMet && techMet && affordable;
    domain.requirements.checklist = [
      { label: `Requires ${techNames.get(domain.requiresTechId) ?? domain.requiresTechId}`, met: techMet },
      ...buildChecklist(domain.requirements, liveGold, liveResources)
    ];
  }
};
