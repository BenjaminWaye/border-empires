import { describe, expect, it } from "vitest";
import { renderTechDetailCard, renderTechDetailModal } from "./client-tech-detail-ui.js";
import type { TechInfo } from "./client-types.js";

const cryptographyTech: TechInfo = {
  id: "cryptography",
  tier: 5,
  name: "Cryptography",
  description: "Unlocks reveal empire and sabotage.",
  mods: {},
  effects: {
    unlockRevealEmpire: true,
    unlockSabotage: true
  },
  requirements: {
    gold: 14000,
    resources: {
      CRYSTAL: 200,
      SHARD: 1
    },
    checklist: [],
    canResearch: true
  }
};

describe("tech detail crystal ability previews", () => {
  it("shows crystal ability preview buttons in the inline tech detail card", () => {
    const html = renderTechDetailCard({
      tech: cryptographyTech,
      techDetailOpen: true,
      techCatalog: [cryptographyTech],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5
    });

    expect(html).toContain("Crystal abilities:");
    expect(html).toContain('data-crystal-ability-info="reveal_empire"');
    expect(html).toContain('data-crystal-ability-info="siphon"');
  });

  it("shows crystal ability preview buttons in the modal tech detail view", () => {
    const html = renderTechDetailModal({
      tech: cryptographyTech,
      techCatalog: [cryptographyTech],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5,
      formatTechBenefitSummary: () => "Unlocks reveal empire | Unlocks sabotage"
    });

    expect(html).toContain("Crystal abilities");
    expect(html).toContain('data-crystal-ability-info="reveal_empire"');
    expect(html).toContain('data-crystal-ability-info="siphon"');
  });
});
