import { describe, expect, it } from "vitest";
import type { TechInfo } from "./client-types.js";
import { renderExpandedTechChoiceTreeHtml } from "./client-tech-tree-html.js";

const baseTech = (overrides: Partial<TechInfo> & Pick<TechInfo, "id" | "name">): TechInfo => ({
  id: overrides.id,
  name: overrides.name,
  description: overrides.description ?? `${overrides.name} description`,
  tier: overrides.tier ?? 1,
  mods: overrides.mods ?? {},
  requirements:
    overrides.requirements ??
    ({
      gold: 0,
      resources: {},
      canResearch: false,
      checklist: []
    } as TechInfo["requirements"]),
  ...(overrides.requires ? { requires: overrides.requires } : {}),
  ...(overrides.prereqIds ? { prereqIds: overrides.prereqIds } : {}),
  ...(overrides.effects ? { effects: overrides.effects } : {}),
  ...(overrides.researchTimeSeconds ? { researchTimeSeconds: overrides.researchTimeSeconds } : {})
});

describe("expanded tech tree rendering", () => {
  it("keeps toolmaking branches visible even when rootId is absent", () => {
    const techCatalog: TechInfo[] = [
      baseTech({ id: "toolmaking", name: "Toolmaking", tier: 1, requirements: { gold: 2000, resources: {}, canResearch: false, checklist: [] } }),
      baseTech({ id: "alchemy", name: "Alchemy", tier: 2, requires: "toolmaking", requirements: { gold: 3500, resources: {}, canResearch: true, checklist: [{ label: "3500 gold", met: true }] } }),
      baseTech({
        id: "crystal-lattices",
        name: "Crystal Lattices",
        tier: 3,
        requires: "alchemy",
        requirements: { gold: 6500, resources: { IRON: 60 }, canResearch: false, checklist: [{ label: "Requires Alchemy", met: false }] }
      })
    ];
    const byId = new Map(techCatalog.map((tech) => [tech.id, tech]));
    const tierMemo = new Map<string, number>();
    const techTier = (id: string): number => {
      const cached = tierMemo.get(id);
      if (typeof cached === "number") return cached;
      const tech = byId.get(id);
      if (!tech) return 1;
      const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
      const tier = prereqs.length === 0 ? 1 : Math.max(...prereqs.map((prereq) => techTier(prereq))) + 1;
      tierMemo.set(id, tier);
      return tier;
    };

    const html = renderExpandedTechChoiceTreeHtml({
      techCatalog,
      techUiSelectedId: "alchemy",
      techRootId: undefined,
      currentResearch: null,
      effectiveOwnedTechIds: ["toolmaking"],
      effectiveTechChoices: ["alchemy"],
      orderedTechIdsByTier: (catalog) => catalog.map((tech) => tech.id),
      techTier: (id) => techTier(id),
      techPrereqIds: (tech) => (tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : []),
      techNameList: (ids) => ids.map((id) => byId.get(id)?.name ?? id).join(", "),
      formatTechCost: (tech) => (tech.requirements.checklist ?? []).map((entry) => entry.label).join(" · ") || "Cost not listed",
      isPendingTechUnlock: () => false,
      formatCooldownShort: () => "0s",
      titleCaseFromId: (id) => id,
      viewportHeight: 700,
      isMobile: false
    });

    expect(html).toContain(">Alchemy<");
    expect(html).toContain(">Crystal Lattices<");
    expect(html).toContain(">Toolmaking<");
    expect(html).toContain("height:");
  });
});
