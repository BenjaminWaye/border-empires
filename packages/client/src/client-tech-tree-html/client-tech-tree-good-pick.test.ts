import { describe, expect, it } from "vitest";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "./client-tech-tree-html.js";
import type { TechInfo } from "../client-types.js";

const tech: TechInfo = { id: "agriculture", name: "Seedstock", description: "", tier: 1, mods: {}, requirements: { gold: 0, resources: {}, canResearch: true } };
const args = {
  techCatalog: [tech], techUiSelectedId: "", techRootId: undefined, currentResearch: null,
  effectiveOwnedTechIds: [], effectiveTechChoices: [tech.id],
  orderedTechIdsByTier: (catalog: TechInfo[]) => catalog.map((entry) => entry.id),
  techTier: () => 1, techPrereqIds: () => [], techNameList: () => "", formatTechCost: () => "0 coin",
  isPendingTechUnlock: () => false, formatCooldownShort: () => "", titleCaseFromId: (id: string) => id,
  viewportHeight: 700, isMobile: false, isGoodPick: () => true
};

for (const render of [renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml]) {
  describe(render.name, () => {
    it("puts Good pick on the clickable Manifest card", () => {
      const html = render(args);
      expect(html).toMatch(/data-tech-card="agriculture"[\s\S]*?Good pick[\s\S]*?<\/button>/);
    });
    it("does not badge owned, pending, or unsuitable Manifests", () => {
      expect(render({ ...args, effectiveOwnedTechIds: [tech.id] })).not.toContain("Good pick");
      expect(render({ ...args, isPendingTechUnlock: () => true })).not.toContain("Good pick");
      expect(render({ ...args, isGoodPick: () => false })).not.toContain("Good pick");
    });
  });
}
