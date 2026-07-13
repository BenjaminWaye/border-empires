import techTreeData from "../data/tech-tree.json" with { type: "json" };
import domainTreeData from "../data/domain-tree.json" with { type: "json" };

type EffectMap = Record<string, unknown>;

type TechEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  effects?: EffectMap;
};

type DomainEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  effects?: EffectMap;
};

const techTree = techTreeData as { techs: TechEntry[] };
const domainTree = domainTreeData as { domains: DomainEntry[] };

const techEntryById = new Map(techTree.techs.map((t) => [t.id, t]));
const domainEntryById = new Map(domainTree.domains.map((d) => [d.id, d]));

const multiplicativeEffectForPlayer = (
  techIds: readonly string[],
  domainIds: readonly string[] | undefined,
  effectKey: string
): number => {
  let multiplier = 1;
  for (const techId of techIds) {
    const value = techEntryById.get(techId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) multiplier *= value;
  }
  for (const domainId of domainIds ?? []) {
    const value = domainEntryById.get(domainId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) multiplier *= value;
  }
  return multiplier;
};

export const resolveFrontierCombatMultipliers = (
  attackerTechIds: readonly string[],
  attackerDomainIds: readonly string[] | undefined,
  defenderTechIds: readonly string[] | undefined,
  defenderDomainIds: readonly string[] | undefined
): {
  attackVsSettledMult: number;
  attackVsFortsMult: number;
  attackVsBarbariansMult: number;
  fortDefenseMult: number;
} => {
  return {
    attackVsSettledMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsSettledMult"),
    attackVsFortsMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsFortsMult"),
    attackVsBarbariansMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsBarbariansMult"),
    fortDefenseMult: multiplicativeEffectForPlayer(defenderTechIds ?? [], defenderDomainIds, "fortDefenseMult"),
  };
};
