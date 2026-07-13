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

describe("domainOwnedHtml — trickle suffix", () => {
  const clockworkStipend: DomainInfo = {
    id: "clockwork-stipend",
    tier: 1,
    name: "Clockwork Stipend",
    description: "Imperial machinery ticks forward a steady supply.",
    requiresTechId: "agriculture",
    mods: {},
    effects: { chosenResourceTrickleOptions: { IRON: 0.2, SUPPLY: 0.2, CRYSTAL: 0.1 } },
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
    requirements: { gold: 6000, resources: { IRON: 120 }, canResearch: false }
  };

  it("appends the locked trickle suffix only to the domain that offered the pick", () => {
    const html = domainOwnedHtml(
      [clockworkStipend, ironBastions],
      ["clockwork-stipend", "iron-bastions"],
      "IRON"
    );
    expect(html).toContain("Clockwork Stipend <em>(IRON trickle)</em>");
    // Dwarf Kingdom never offered a trickle table — must not get the suffix.
    expect(html).toContain("<strong>Dwarf Kingdom</strong>");
    expect(html).not.toContain("Dwarf Kingdom <em>(");
  });

  it("does not append a suffix when the player has not locked a resource", () => {
    const html = domainOwnedHtml([clockworkStipend], ["clockwork-stipend"], undefined);
    expect(html).toContain("<strong>Clockwork Stipend</strong>");
    expect(html).not.toContain("trickle)</em>");
  });

  it("ignores a present-but-empty chosenResourceTrickleOptions object", () => {
    const stipendWithEmptyOptions: DomainInfo = {
      ...clockworkStipend,
      effects: { chosenResourceTrickleOptions: {} }
    };
    const html = domainOwnedHtml([stipendWithEmptyOptions], ["clockwork-stipend"], "IRON");
    // Empty options table means the domain doesn't actually offer a pick; the
    // locked-resource suffix must not appear.
    expect(html).not.toContain("trickle)</em>");
  });

  it("ignores a non-numeric rate in chosenResourceTrickleOptions", () => {
    const stipendWithBogusRates: DomainInfo = {
      ...clockworkStipend,
      effects: { chosenResourceTrickleOptions: { IRON: "0.2" } }
    };
    const html = domainOwnedHtml([stipendWithBogusRates], ["clockwork-stipend"], "IRON");
    expect(html).not.toContain("trickle)</em>");
  });

  it("renders the locked CRYSTAL suffix", () => {
    const html = domainOwnedHtml([clockworkStipend], ["clockwork-stipend"], "CRYSTAL");
    expect(html).toContain("Clockwork Stipend <em>(CRYSTAL trickle)</em>");
  });

  it("ignores non-IRON/SUPPLY/CRYSTAL keys in the options table", () => {
    // Server-side chosenTrickleOptionsForDomain only honors IRON/SUPPLY/CRYSTAL;
    // the client gate must agree so a future data-edit bug shipping
    // { SHARD: 0.5 } doesn't render a misleading suffix client-side while the
    // sim silently ignores the entry.
    const stipendWithBogusKey: DomainInfo = {
      ...clockworkStipend,
      effects: { chosenResourceTrickleOptions: { SHARD: 0.5 } }
    };
    const html = domainOwnedHtml([stipendWithBogusKey], ["clockwork-stipend"], "IRON");
    expect(html).not.toContain("trickle)</em>");
  });

  it("does not render the suffix when the locked resource is not in this domain's offered options", () => {
    // Hypothetical second trickle domain that offers IRON only; player has
    // locked SUPPLY on a different domain. The narrower domain's card must
    // NOT claim SUPPLY is trickling — it only ever offered IRON.
    const narrowTrickleDomain: DomainInfo = {
      id: "future-narrow-trickle",
      tier: 2,
      name: "Iron Tributaries",
      description: "Hypothetical iron-only trickle.",
      requiresTechId: "masonry",
      mods: {},
      effects: { chosenResourceTrickleOptions: { IRON: 0.1 } },
      requirements: { gold: 0, resources: {}, canResearch: false }
    };
    const html = domainOwnedHtml([narrowTrickleDomain], ["future-narrow-trickle"], "SUPPLY");
    expect(html).toContain("<strong>Iron Tributaries</strong>");
    expect(html).not.toContain("trickle)</em>");
  });
});

describe("renderDomainDetailCardHtml — locked trickle pick", () => {
  const clockworkStipend: DomainInfo = {
    id: "clockwork-stipend",
    tier: 1,
    name: "Clockwork Stipend",
    description: "Imperial machinery ticks forward a steady supply.",
    requiresTechId: "agriculture",
    mods: {},
    effects: { chosenResourceTrickleOptions: { IRON: 0.2, SUPPLY: 0.2, CRYSTAL: 0.1 } },
    requirements: {
      gold: 6000,
      resources: { FOOD: 120 },
      canResearch: false,
      checklist: [{ label: "Requires tech agriculture", met: true }]
    }
  };

  it("surfaces the locked resource and its per-minute rate on the owned detail card", () => {
    // Regression: previously the detail card only showed "Chosen" with no hint
    // of which resource the player had locked in, forcing them to dig into the
    // owned-summary card for that information.
    const html = renderDomainDetailCardHtml({
      domain: clockworkStipend,
      domainIds: ["clockwork-stipend"],
      chosenInTier: clockworkStipend,
      currentTier: 1,
      requiresTechName: "Agriculture",
      chosenTrickleResource: "SUPPLY"
    });

    expect(html).toContain("Your pick");
    expect(html).toContain("SUPPLY (+0.20/min, locked)");
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
    // Player has locked SUPPLY on some other domain, but they are inspecting
    // a non-owned domain — the detail card must not pretend SUPPLY belongs to
    // the inspected domain.
    const html = renderDomainDetailCardHtml({
      domain: clockworkStipend,
      domainIds: [],
      chosenInTier: undefined,
      currentTier: 1,
      requiresTechName: "Agriculture",
      chosenTrickleResource: "SUPPLY"
    });

    expect(html).not.toContain("Your pick");
  });
});
