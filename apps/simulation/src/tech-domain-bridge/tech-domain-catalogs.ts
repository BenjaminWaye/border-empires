import { readFileSync } from "node:fs";
import { AFC_SPECIALIZATIONS, afcSpecializationProgress, usesAfcSpecializations, type AfcProgressionState } from "@border-empires/shared";
import { resolveDataPath, TECH_TREE_RELATIVE_CANDIDATES, DOMAIN_TREE_RELATIVE_CANDIDATES } from "./tech-domain-bridge-data-paths.js";
import type { DomainCatalogEntry, TechCatalogEntry } from "./tech-domain-bridge-types.js";

export const TECH_TREE_PATH = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES);
export const DOMAIN_TREE_PATH = resolveDataPath(DOMAIN_TREE_RELATIVE_CANDIDATES);
export const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: TechCatalogEntry[] };
export const domainTree = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as { domains: DomainCatalogEntry[] };
export const specializationCatalog: readonly DomainCatalogEntry[] = AFC_SPECIALIZATIONS;
export const techEntryById = new Map(techTree.techs.map(tech => [tech.id, tech]));
export const domainEntryById = new Map([...domainTree.domains, ...specializationCatalog].map(domain => [domain.id, domain]));

export const domainCatalogForPlayer = (player: Pick<AfcProgressionState, "afcUpgradeRuleset" | "domainIds">): readonly DomainCatalogEntry[] =>
  usesAfcSpecializations(player) ? specializationCatalog : domainTree.domains;

export function openDomainChoices(ownedDomainIds: readonly string[], player?: AfcProgressionState): string[] {
  if (player && usesAfcSpecializations(player)) return afcSpecializationProgress(player, techTree.techs).choices;
  const max = domainTree.domains.reduce((tier, domain) => ownedDomainIds.includes(domain.id) ? Math.max(tier, domain.tier) : tier, 0);
  const target = Math.min(5, max + 1);
  if (domainTree.domains.some(domain => domain.tier === target && ownedDomainIds.includes(domain.id))) return [];
  return domainTree.domains.filter(domain => domain.tier === target).map(domain => domain.id);
}

export function reachableDomainChoices(ownedTechIds: readonly string[], ownedDomainIds: readonly string[], player?: AfcProgressionState): string[] {
  const choices = openDomainChoices(ownedDomainIds, player);
  return player && usesAfcSpecializations(player) ? choices
    : choices.filter(id => ownedTechIds.includes(domainEntryById.get(id)!.requiresTechId));
}
