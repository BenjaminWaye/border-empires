import { manifestGoldRequirement, type AfcSpecializationRuleset } from "@border-empires/shared";
import { domainCatalogForPlayer, openDomainChoices, reachableDomainChoices } from "../../../simulation/src/tech-domain-bridge/tech-domain-catalogs.js";
import type { DomainCatalogEntry, TechCatalogEntry } from "../../../simulation/src/tech-domain-bridge/tech-domain-bridge.js";

type StrategicResourceKey = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
type StrategicAmounts = Partial<Record<StrategicResourceKey, number>>;
type StatModKey = "attack" | "defense" | "income" | "vision";
type CatalogRequirements = { gold: number; resources: StrategicAmounts; canResearch: boolean };

export type InitTechCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  researchTimeSeconds?: number;
  rootId?: string;
  branch?: string;
  // Lets the client tell AFC modules apart (Call down actions, module-gated builds).
  manifestCategory?: TechCatalogEntry["manifestCategory"];
  prereqIds?: string[];
  effects?: Record<string, unknown>;
  mods: Partial<Record<StatModKey, number>>;
  requirements: CatalogRequirements;
  grantsPowerup?: { id: string; charges: number };
};

export type InitDomainCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  branch?: string;
  mechanicalSummary?: string;
  category?: "ongoing" | "installation" | "active";
  effects?: Record<string, unknown>;
  mods: Partial<Record<StatModKey, number>>;
  requirements: CatalogRequirements;
};

type CatalogAffordability = { availableGold: number; availableStrategic: StrategicAmounts };

const toResources = (cost?: Partial<Record<"gold" | "food" | "titanium" | "crystal" | "umbrite", number>>): StrategicAmounts => ({
  ...(typeof cost?.food === "number" && cost.food > 0 ? { FOOD: cost.food } : {}),
  ...(typeof cost?.titanium === "number" && cost.titanium > 0 ? { TITANIUM: cost.titanium } : {}),
  ...(typeof cost?.crystal === "number" && cost.crystal > 0 ? { CRYSTAL: cost.crystal } : {}),
  ...(typeof cost?.umbrite === "number" && cost.umbrite > 0 ? { UMBRITE: cost.umbrite } : {})
});

const hasResources = (required: StrategicAmounts, available: StrategicAmounts): boolean =>
  (Object.entries(required) as Array<[StrategicResourceKey, number]>).every(([resource, amount]) => (available[resource] ?? 0) >= (amount ?? 0));

export const buildInitTechCatalog = (
  techs: readonly TechCatalogEntry[],
  input: CatalogAffordability & { researchedCount: number; techChoices: readonly string[]; manifestGoldDiscount?: number }
): InitTechCatalogEntry[] =>
  techs.map((tech) => {
    const resources = toResources(tech.cost);
    const goldRequirement = manifestGoldRequirement(input.researchedCount, input.manifestGoldDiscount ?? 0);
    return {
      id: tech.id,
      tier: tech.tier,
      name: tech.name,
      description: tech.description,
      ...(typeof tech.researchTimeSeconds === "number" ? { researchTimeSeconds: tech.researchTimeSeconds } : {}),
      ...(tech.rootId ? { rootId: tech.rootId } : {}),
      ...(tech.branch ? { branch: tech.branch } : {}),
      ...(tech.manifestCategory ? { manifestCategory: tech.manifestCategory } : {}),
      ...(tech.prereqIds ? { prereqIds: tech.prereqIds } : {}),
      ...(tech.effects ? { effects: tech.effects } : {}),
      mods: tech.mods ?? {},
      requirements: {
        ...goldRequirement,
        resources,
        canResearch: input.techChoices.includes(tech.id) && input.availableGold >= goldRequirement.gold && hasResources(resources, input.availableStrategic)
      },
      ...(tech.grantsPowerup ? { grantsPowerup: tech.grantsPowerup } : {})
    };
  });

export const buildInitDomainCatalog = (
  domains: readonly DomainCatalogEntry[],
  input: CatalogAffordability & { reachableDomainChoiceSet: ReadonlySet<string> }
): InitDomainCatalogEntry[] =>
  domains.map((domain) => {
    const resources = toResources(domain.cost);
    return {
      id: domain.id,
      tier: domain.tier,
      name: domain.name,
      description: domain.description,
      requiresTechId: domain.requiresTechId,
      ...(domain.branch ? { branch: domain.branch, mechanicalSummary: domain.mechanicalSummary, category: domain.category } : {}),
      ...(domain.effects ? { effects: domain.effects } : {}),
      mods: domain.mods ?? {},
      requirements: {
        gold: domain.cost?.gold ?? 0,
        resources,
        canResearch:
          input.reachableDomainChoiceSet.has(domain.id) &&
          input.availableGold >= (domain.cost?.gold ?? 0) &&
          hasResources(resources, input.availableStrategic)
      }
    };
  });

/**
 * Upgrade catalogue + open choices for INIT under the AFC ruleset (the player's, else the season's, so a
 * joiner not yet in the live snapshot doesn't get the legacy tree). None means the legacy tree. The ruleset
 * is echoed back so INIT's player object carries the same one the catalogue was built with.
 */
export function initDomainProgression(techIds: string[], domainIds: string[], afcUpgradeRuleset: AfcSpecializationRuleset | undefined): {
  afcUpgradeRuleset: AfcSpecializationRuleset | undefined; domains: readonly DomainCatalogEntry[]; domainChoices: string[]; reachableDomainChoiceSet: Set<string>;
} {
  const progression = { techIds, domainIds, ...(afcUpgradeRuleset ? { afcUpgradeRuleset } : {}) };
  return {
    afcUpgradeRuleset,
    domains: domainCatalogForPlayer(progression),
    domainChoices: openDomainChoices(domainIds, progression),
    reachableDomainChoiceSet: new Set(reachableDomainChoices(techIds, domainIds, progression))
  };
}
