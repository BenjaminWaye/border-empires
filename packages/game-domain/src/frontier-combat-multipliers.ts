import techTreeData from "../data/tech-tree.json" with { type: "json" };
import domainTreeData from "../data/domain-tree.json" with { type: "json" };

type EffectMap = Record<string, unknown>;
type StatMods = { attack?: number; defense?: number };

type TechEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  effects?: EffectMap;
  mods?: StatMods;
};

type DomainEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  effects?: EffectMap;
  mods?: StatMods;
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

// Mirrors recomputeMods in apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts
// (the source of truth for player.mods.attack/defense), so a preview computed
// before an attack is committed agrees with what the simulation will actually
// apply once combat resolves.
const multiplicativeStatModForPlayer = (
  techIds: readonly string[],
  domainIds: readonly string[] | undefined,
  statKey: keyof StatMods
): number => {
  let multiplier = 1;
  for (const techId of techIds) {
    const value = techEntryById.get(techId)?.mods?.[statKey];
    if (typeof value === "number" && Number.isFinite(value)) multiplier *= value;
  }
  for (const domainId of domainIds ?? []) {
    const value = domainEntryById.get(domainId)?.mods?.[statKey];
    if (typeof value === "number" && Number.isFinite(value)) multiplier *= value;
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
  attackerStatMult: number;
  defenderStatMult: number;
} => {
  return {
    attackVsSettledMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsSettledMult"),
    attackVsFortsMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsFortsMult"),
    attackVsBarbariansMult: multiplicativeEffectForPlayer(attackerTechIds, attackerDomainIds, "attackVsBarbariansMult"),
    fortDefenseMult: multiplicativeEffectForPlayer(defenderTechIds ?? [], defenderDomainIds, "fortDefenseMult"),
    attackerStatMult: multiplicativeStatModForPlayer(attackerTechIds, attackerDomainIds, "attack"),
    defenderStatMult: multiplicativeStatModForPlayer(defenderTechIds ?? [], defenderDomainIds, "defense"),
  };
};
