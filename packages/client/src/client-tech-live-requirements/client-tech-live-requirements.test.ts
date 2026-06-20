import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderDomainChoiceGridHtml, ownedDomainByTier } from "../client-tech-html/client-tech-html.js";
import { refreshLiveTechRequirements } from "./client-tech-live-requirements.js";

describe("refreshLiveTechRequirements", () => {
  it("keeps the next domain tier open while showing missing tech requirements", () => {
    const state = createInitialState();
    state.gold = 100_000;
    state.strategicResources = { FOOD: 10_000, IRON: 10_000, CRYSTAL: 10_000, SUPPLY: 10_000, SHARD: 10_000 };
    state.techIds = ["toolmaking"];
    state.techCatalog = [
      {
        id: "toolmaking",
        tier: 1,
        name: "Workshop Standards",
        description: "",
        mods: {},
        effects: {},
        requirements: { gold: 0, resources: {}, canResearch: false }
      },
      {
        id: "logistics",
        tier: 3,
        name: "Convoy Logistics",
        description: "",
        mods: {},
        effects: {},
        requirements: { gold: 0, resources: {}, canResearch: false }
      }
    ];
    state.domainIds = ["frontier-doctrine"];
    state.domainChoices = ["frontier-bureau"];
    state.domainCatalog = [
      {
        id: "frontier-doctrine",
        tier: 1,
        name: "Frontier Doctrine",
        description: "",
        requiresTechId: "toolmaking",
        mods: {},
        effects: {},
        requirements: { gold: 6000, resources: { FOOD: 120 }, canResearch: false }
      },
      {
        id: "frontier-bureau",
        tier: 2,
        name: "Frontier Bureau",
        description: "",
        requiresTechId: "logistics",
        mods: {},
        effects: {},
        requirements: { gold: 14000, resources: { FOOD: 220, SHARD: 1 }, canResearch: false }
      }
    ];

    refreshLiveTechRequirements(state);

    const html = renderDomainChoiceGridHtml({
      domainCatalog: state.domainCatalog,
      domainIds: state.domainIds,
      domainUiSelectedId: "frontier-bureau",
      ownedByTier: ownedDomainByTier(state.domainCatalog, state.domainIds),
      currentTier: 2,
      requiresTechNames: { "frontier-doctrine": "Workshop Standards", "frontier-bureau": "Convoy Logistics" }
    });

    expect(state.domainCatalog.find((domain) => domain.id === "frontier-bureau")?.requirements.canResearch).toBe(false);
    expect(html).toContain("Choose one domain for Tier 2");
    expect(html).toContain("✗ Requires Convoy Logistics");
    expect(html).not.toContain("Unlock Tier 1 first to reach this tier");
  });
});
