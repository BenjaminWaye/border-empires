import { describe, expect, it } from "vitest";
import type { DomainInfo } from "./client-types.js";
import { renderDomainChoiceGridHtml } from "./client-tech-html.js";

describe("domain card previews", () => {
  it("shows unmet tech requirements directly on blocked domain cards", () => {
    const domain: DomainInfo = {
      id: "expansionist",
      tier: 2,
      name: "Expansionist",
      description: "Pushes frontier growth harder.",
      requiresTechId: "cartography",
      mods: {},
      requirements: {
        gold: 0,
        resources: {},
        canResearch: false,
        checklist: [
          { label: "Requires Cartography", met: false },
          { label: "SHARD 20", met: true }
        ]
      }
    };

    const html = renderDomainChoiceGridHtml({
      domainCatalog: [domain],
      domainIds: [],
      domainUiSelectedId: "",
      ownedByTier: new Map(),
      currentTier: 2,
      requiresTechNames: { expansionist: "Cartography" }
    });

    expect(html).toContain("✗ Requires Cartography");
  });

  it("renders domain cards as explicit buttons for detail opening", () => {
    const domain: DomainInfo = {
      id: "farmers-compact",
      tier: 1,
      name: "Farmer's Compact",
      description: "Improves growth and food efficiency.",
      requiresTechId: "coinage",
      mods: {},
      requirements: {
        gold: 6000,
        resources: {},
        canResearch: true,
        checklist: [{ label: "Gold 6000", met: true }]
      }
    };

    const html = renderDomainChoiceGridHtml({
      domainCatalog: [domain],
      domainIds: [],
      domainUiSelectedId: "",
      ownedByTier: new Map(),
      currentTier: 1,
      requiresTechNames: { "farmers-compact": "Coinage" }
    });

    expect(html).toContain('type="button"');
    expect(html).toContain('data-domain-card="farmers-compact"');
  });
});
