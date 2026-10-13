// "Leads to": the Manifests this one opens up, what else each still needs,
// and how far the branch goes beyond them.
import type { TechInfo } from "../client-types.js";

export type ManifestLeadsToEntry = {
  id: string;
  name: string;
  tier: number;
  owned: boolean;
  // Names of the other prerequisites you do not own yet (excluding the
  // Manifest being viewed).
  alsoNeeds: string[];
};

export type ManifestLeadsTo = {
  next: ManifestLeadsToEntry[];
  // Manifests reachable only further down the branch (past the direct `next` ones).
  laterCount: number;
};

export type ManifestLeadsToDeps = {
  techCatalog: readonly TechInfo[];
  ownedTechIds: readonly string[];
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds">) => string[];
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
};

export const manifestLeadsTo = (techId: string, deps: ManifestLeadsToDeps): ManifestLeadsTo => {
  const byId = new Map(deps.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const owned = new Set(deps.ownedTechIds);
  const childrenOf = (id: string): TechInfo[] => deps.techCatalog.filter((candidate) => deps.techPrereqIds(candidate).includes(id));
  const next = childrenOf(techId)
    .map((child) => ({
      id: child.id,
      name: child.name,
      tier: deps.techTier(child.id, byId, tierMemo),
      owned: owned.has(child.id),
      alsoNeeds: deps
        .techPrereqIds(child)
        .filter((id) => id !== techId && !owned.has(id))
        .map((id) => byId.get(id)?.name ?? id)
    }))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const seen = new Set<string>([techId, ...next.map((entry) => entry.id)]);
  const queue = [...next.map((entry) => entry.id)];
  let laterCount = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    for (const child of childrenOf(id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      laterCount += 1;
      queue.push(child.id);
    }
  }
  return { next, laterCount };
};
