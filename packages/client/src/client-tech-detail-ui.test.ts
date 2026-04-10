import { describe, expect, it } from "vitest";
import { renderTechDetailCard, renderTechDetailModal, renderTechDetailPrompt } from "./client-tech-detail-ui.js";
import type { TechInfo } from "./client-types.js";

const cryptographyTech: TechInfo = {
  id: "cryptography",
  tier: 5,
  name: "Cryptography",
  description: "Unlocks reveal empire.",
  mods: {},
  effects: {
    unlockRevealEmpire: true
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

const logisticsTech: TechInfo = {
  id: "logistics",
  tier: 3,
  name: "Logistics",
  description: "Improves operational tempo and unlocks Siphon.",
  mods: {},
  effects: {
    operationalTempoMult: 1.1,
    unlockSabotage: true
  },
  requirements: {
    gold: 7000,
    resources: {
      SUPPLY: 80
    },
    checklist: [],
    canResearch: true
  }
};

describe("tech detail crystal ability previews", () => {
  it("does not render the tech detail helper placeholder", () => {
    expect(renderTechDetailPrompt()).toBe("");
  });

  it("shows crystal ability preview buttons in the inline tech detail card", () => {
    const html = renderTechDetailCard({
      tech: cryptographyTech,
      techDetailOpen: true,
      techCatalog: [cryptographyTech],
      ownedTechIds: [],
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
    expect(html).not.toContain('data-crystal-ability-info="siphon"');
  });

  it("shows crystal ability preview buttons in the modal tech detail view", () => {
    const html = renderTechDetailModal({
      tech: cryptographyTech,
      techCatalog: [cryptographyTech],
      ownedTechIds: [],
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
    expect(html).not.toContain('data-crystal-ability-info="siphon"');
  });

  it("shows siphon on logistics tech detail", () => {
    const html = renderTechDetailCard({
      tech: logisticsTech,
      techDetailOpen: true,
      techCatalog: [logisticsTech],
      ownedTechIds: [],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 3
    });

    expect(html).toContain('data-crystal-ability-info="siphon"');
  });

  it("shows owned techs as unlocked instead of locked", () => {
    const html = renderTechDetailCard({
      tech: cryptographyTech,
      techDetailOpen: true,
      techCatalog: [cryptographyTech],
      ownedTechIds: ["cryptography"],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5
    });

    expect(html).toContain("Already unlocked.");
    expect(html).toContain(">Unlocked<");
    expect(html).not.toContain(">Locked<");
  });
});
