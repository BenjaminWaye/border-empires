import { describe, expect, it } from "vitest";
import type { DomainInfo } from "../client-types.js";
import { domainOwnedHtml, renderDomainChoiceGridHtml, renderDomainDetailCardHtml } from "../client-tech-html/client-tech-html.js";

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

  it("shows unmet domain requirements directly on the card", () => {
    const domain: DomainInfo = {
      id: "frontier-doctrine",
      tier: 1,
      name: "Frontier Doctrine",
      description: "Speeds settlement expansion.",
      requiresTechId: "coinage",
      mods: {},
      requirements: {
        gold: 6000,
        resources: {},
        canResearch: false,
        checklist: [
          { label: "Gold 6000", met: false },
          { label: "Requires Coinage", met: false }
        ]
      }
    };

    const html = renderDomainChoiceGridHtml({
      domainCatalog: [domain],
      domainIds: [],
      domainUiSelectedId: "",
      ownedByTier: new Map(),
      currentTier: 1,
      requiresTechNames: { "frontier-doctrine": "Coinage" }
    });

    expect(html).toContain("✗ Gold 6000");
    expect(html).toContain("✗ Requires Coinage");
  });

  it("collapses committed tiers down to the chosen domain card", () => {
    const frontierDoctrine: DomainInfo = {
      id: "frontier-doctrine",
      tier: 1,
      name: "Frontier Doctrine",
      description: "Speeds settlement expansion.",
      requiresTechId: "coinage",
      mods: {},
      requirements: {
        gold: 6000,
        resources: {},
        canResearch: false,
        checklist: [{ label: "Gold 6000", met: true }]
      }
    };
    const farmersCompact: DomainInfo = {
      id: "farmers-compact",
      tier: 1,
      name: "Farmer's Compact",
      description: "Improves growth and food efficiency.",
      requiresTechId: "coinage",
      mods: {},
      requirements: {
        gold: 6000,
        resources: {},
        canResearch: false,
        checklist: [{ label: "Gold 6000", met: false }]
      }
    };
    const ironBastions: DomainInfo = {
      id: "iron-bastions",
      tier: 2,
      name: "Dwarf Kingdom",
      description: "Fortifies later defenses.",
      requiresTechId: "ironworking",
      mods: {},
      requirements: {
        gold: 9000,
        resources: {},
        canResearch: false,
        checklist: [{ label: "Requires Ironworking", met: false }]
      }
    };

    const html = renderDomainChoiceGridHtml({
      domainCatalog: [farmersCompact, frontierDoctrine, ironBastions],
      domainIds: ["frontier-doctrine"],
      domainUiSelectedId: "frontier-doctrine",
      ownedByTier: new Map([[1, frontierDoctrine]]),
      currentTier: 2,
      requiresTechNames: {
        "farmers-compact": "Coinage",
        "frontier-doctrine": "Coinage",
        "iron-bastions": "Ironworking"
      }
    });

    expect(html).toContain('data-domain-card="frontier-doctrine"');
    expect(html).toContain('data-domain-card="farmers-compact"');
    expect(html).toContain("Tier 1 already committed to Frontier Doctrine");
    expect(html).toContain('data-domain-card="iron-bastions"');
  });

  it("omits the duplicate inline close control in the mobile detail overlay variant", () => {
    const domain: DomainInfo = {
      id: "sharding",
      tier: 1,
      name: "Sharding",
      description: "Lets early expansion breathe.",
      requiresTechId: "toolmaking",
      mods: {},
      requirements: {
        gold: 6000,
        resources: { FOOD: 120 },
        canResearch: true,
        checklist: [{ label: "Requires tech toolmaking", met: true }]
      }
    };

    const html = renderDomainDetailCardHtml({
      domain,
      domainIds: [],
      chosenInTier: undefined,
      currentTier: 1,
      requiresTechName: "Toolmaking",
      pendingDomainUnlockId: "",
      showInlineClose: false
    });

    expect(html).not.toContain('data-domain-detail-close="button"');
    expect(html).toContain('data-domain-unlock="sharding"');
  });

  it("shows a pending state while a domain choice is waiting on the server", () => {
    const domain: DomainInfo = {
      id: "sharding",
      tier: 1,
      name: "Sharding",
      description: "Lets early expansion breathe.",
      requiresTechId: "toolmaking",
      mods: {},
      requirements: {
        gold: 6000,
        resources: { FOOD: 120 },
        canResearch: true,
        checklist: [{ label: "Requires tech toolmaking", met: true }]
      }
    };

    const html = renderDomainDetailCardHtml({
      domain,
      domainIds: [],
      chosenInTier: undefined,
      currentTier: 1,
      requiresTechName: "Toolmaking",
      pendingDomainUnlockId: "sharding"
    });

    expect(html).toContain("Choosing Tier 1...");
    expect(html).toContain("Sending your domain choice to the server...");
  });

  it("disables the detail action for an already chosen domain", () => {
    const domain: DomainInfo = {
      id: "sharding",
      tier: 1,
      name: "Sharding",
      description: "Lets early expansion breathe.",
      requiresTechId: "toolmaking",
      mods: {},
      requirements: {
        gold: 6000,
        resources: { FOOD: 120 },
        canResearch: true,
        checklist: [{ label: "Requires tech toolmaking", met: true }]
      }
    };

    const html = renderDomainDetailCardHtml({
      domain,
      domainIds: ["sharding"],
      chosenInTier: domain,
      currentTier: 2,
      requiresTechName: "Toolmaking"
    });

    expect(html).toContain(">Chosen</button>");
    expect(html).toContain('data-domain-unlock="sharding" disabled');
  });
});

describe("domainOwnedHtml — resource slot suffix", () => {
  const clockworkStipend: DomainInfo = {
    id: "clockwork-stipend",
    tier: 1,
    name: "Clockwork Stipend",
    description: "Imperial machinery allocates dedicated logistics slots for one chosen resource (iron, supply, or crystal).",
    requiresTechId: "agriculture",
    mods: {},
    effects: { chosenResourceSlotGrant: 1 },
    requirements: { gold: 6000, resources: { FOOD: 120 }, canResearch: false }
  };

  const ironBastions: DomainInfo = {
    id: "iron-bastions",
    tier: 1,
    name: "Dwarf Kingdom",
    description: "Forts pop up overnight.",
    requiresTechId: "masonry",
    mods: {},
    effects: { fortBuildSpeedMult: 1.5 },
    requirements: { gold: 6000, resources: { TITANIUM: 120 }, canResearch: false }
  };

  it("appends the locked slot suffix only to the domain that offered the pick", () => {
    const html = domainOwnedHtml(
      [clockworkStipend, ironBastions],
      ["clockwork-stipend", "iron-bastions"],
      "TITANIUM"
    );
    expect(html).toContain("Clockwork Stipend <em>(TITANIUM slot)</em>");
    // Dwarf Kingdom never offered a slot grant — must not get the suffix.
    expect(html).toContain("<strong>Dwarf Kingdom</strong>");
    expect(html).not.toContain("Dwarf Kingdom <em>(");
  });

  it("does not append a suffix when the player has not locked a resource", () => {
    const html = domainOwnedHtml([clockworkStipend], ["clockwork-stipend"], undefined);
    expect(html).toContain("<strong>Clockwork Stipend</strong>");
    expect(html).not.toContain("slot)</em>");
  });

  it("ignores a missing chosenResourceSlotGrant effect", () => {
    const stipendWithoutGrant: DomainInfo = {
      ...clockworkStipend,
      effects: {}
    };
    const html = domainOwnedHtml([stipendWithoutGrant], ["clockwork-stipend"], "TITANIUM");
    expect(html).not.toContain("slot)</em>");
  });

  it("renders the locked CRYSTAL suffix", () => {
    const html = domainOwnedHtml([clockworkStipend], ["clockwork-stipend"], "CRYSTAL");
    expect(html).toContain("Clockwork Stipend <em>(CRYSTAL slot)</em>");
  });

  it("does not render the suffix when the locked resource is not a valid slot resource", () => {
    // SHARD is not in TRICKLE_RESOURCE_KEYS so the client gate rejects it.
    const stipendWithBogusKey: DomainInfo = {
      ...clockworkStipend,
      effects: { chosenResourceSlotGrant: 1 }
    };
    const html = domainOwnedHtml([stipendWithBogusKey], ["clockwork-stipend"], "SHARD" as never);
    expect(html).not.toContain("slot)</em>");
  });

  it("does not render the suffix when the locked resource is not in this domain's offered options (fictional narrow domain)", () => {
    // The client always offers all TRICKLE_RESOURCE_KEYS for any domain with
    // chosenResourceSlotGrant > 0, so this test verifies the per-domain gate:
    // if the domain doesn't carry the effect at all, no suffix appears.
    const noGrantDomain: DomainInfo = {
      id: "iron-bastions",
      tier: 1,
      name: "Dwarf Kingdom",
      description: "Forts pop up overnight.",
      requiresTechId: "masonry",
      mods: {},
      requirements: { gold: 6000, resources: { TITANIUM: 120 }, canResearch: false }
    };
    const html = domainOwnedHtml([noGrantDomain], ["iron-bastions"], "UMBRITE");
    expect(html).toContain("<strong>Dwarf Kingdom</strong>");
    expect(html).not.toContain("slot)</em>");
  });
});

describe("renderDomainDetailCardHtml — locked resource slot", () => {
  const clockworkStipend: DomainInfo = {
    id: "clockwork-stipend",
    tier: 1,
    name: "Clockwork Stipend",
    description: "Imperial machinery allocates dedicated logistics slots for one chosen resource (iron, supply, or crystal).",
    requiresTechId: "agriculture",
    mods: {},
    effects: { chosenResourceSlotGrant: 1 },
    requirements: {
      gold: 6000,
      resources: { FOOD: 120 },
      canResearch: false,
      checklist: [{ label: "Requires tech agriculture", met: true }]
    }
  };

  it("surfaces the locked resource and slot count on the owned detail card", () => {
    const html = renderDomainDetailCardHtml({
      domain: clockworkStipend,
      domainIds: ["clockwork-stipend"],
      chosenInTier: clockworkStipend,
      currentTier: 1,
      requiresTechName: "Agriculture",
      chosenTrickleResource: "UMBRITE"
    });

    expect(html).toContain("Your pick");
    expect(html).toContain("UMBRITE (+1 slot, locked)");
  });

  it("omits the locked-pick section when the player has not picked yet", () => {
    const html = renderDomainDetailCardHtml({
      domain: clockworkStipend,
      domainIds: [],
      chosenInTier: undefined,
      currentTier: 1,
      requiresTechName: "Agriculture"
    });

    expect(html).not.toContain("Your pick");
  });

  it("omits the locked-pick section for a domain the player does not own", () => {
    const html = renderDomainDetailCardHtml({
      domain: clockworkStipend,
      domainIds: [],
      chosenInTier: undefined,
      currentTier: 1,
      requiresTechName: "Agriculture",
      chosenTrickleResource: "UMBRITE"
    });

    expect(html).not.toContain("Your pick");
  });
});
