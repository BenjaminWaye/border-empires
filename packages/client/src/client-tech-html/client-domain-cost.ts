import type { DomainInfo } from "../client-types.js";

export const formatDomainCost = (domain: DomainInfo): string => {
  if (domain.mechanicalSummary && domain.requirements.gold === 0 && Object.values(domain.requirements.resources).every(amount => !amount)) return "Free · included with your Manifest tier";
  const checklist = domain.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /coin|gold|food|titanium|crystal|umbrite|shard/i.test(item.label)).map((item) => item.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallbackCostBits: string[] = [];
  if ((domain.requirements.gold ?? 0) > 0) {
    fallbackCostBits.push(`${domain.requirements.gold.toLocaleString()} coin`);
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = domain.requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) fallbackCostBits.push(`${amount.toLocaleString()} ${resourceKey.toLowerCase()}`);
  }
  return fallbackCostBits.length > 0 ? fallbackCostBits.join(" · ") : "Cost not listed";
};

