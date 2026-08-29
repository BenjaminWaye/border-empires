import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { emptyEconomyBreakdown } from "../client-economy-model.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

describe("renderEconomyPanelHtml", () => {
  it("renders shared server breakdown counts and upkeep without depending on cached tiles", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.GOLD.sources = [
      { label: "Docks", amountPerMinute: 6.5, count: 9 },
      { label: "Towns", amountPerMinute: 10, count: 10 }
    ];
    economyBreakdown.GOLD.sinks = [{ label: "Fur Synthesizer upkeep", amountPerMinute: 1.4, count: 2 }];

    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 24.5,
      me: "me",
      incomePerMinute: 32.6,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0,  gold: 1.4 },
      upkeepLastTick: { foodCoverage: 1, gold: { contributors: economyBreakdown.GOLD.sinks } },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Towns · 10");
    expect(html).toContain("+14400.0/day");
    expect(html).toContain("Fur Synthesizer upkeep · 2");
    expect(html).toContain("-2016.0/day");
    expect(html).not.toContain("No upkeep on this resource");
  });

  it("does not show synthesizer gold upkeep on the output resource slot tab", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.UMBRITE.sources = [{ label: "Fur Synthesizer", amountPerMinute: 0.9, count: 1 }];
    economyBreakdown.UMBRITE.sinks = [{ label: "Fur Synthesizer upkeep", amountPerMinute: 12, count: 1, resourceKey: "GOLD" }];

    const html = renderEconomyPanelHtml({
      focus: "UMBRITE",
      gold: 100,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 50, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0.9, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0,  gold: 12 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).not.toContain("Fur Synthesizer upkeep");
    expect(html).not.toContain("-17280.0 GOLD/day");
  });

  it("renders paused town income buckets even when manpower gating zeros their income", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.GOLD.sources = [
      { label: "Towns", amountPerMinute: 0, count: 7, note: "Paused until manpower is full (3135/3300)" }
    ];

    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 100,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0,  gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Towns · 7");
    expect(html).toContain("Paused until manpower is full (3135/3300)");
    expect(html).toContain("+0.0/day");
  });

  it("falls back to a live income row when the session has rates but no detailed source buckets yet", () => {
    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 63.6,
      me: "me",
      incomePerMinute: 10.8,
      strategicResources: { FOOD: 8, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 2 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 8, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0,  gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Live empire income");
    expect(html).toContain("Detailed source rows are still catching up on this session.");
    expect(html).toContain("+15552.0/day");
    expect(html).not.toContain("No current income");
  });

  it("renders TITANIUM as slots-used, not a stock/cap flow, and lists the Fort occupying one", () => {
    const html = renderEconomyPanelHtml({
      focus: "TITANIUM",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 2, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          fort: { ownerId: "me", status: "active", variant: "FORT" }
        }
      ],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("1 / 2 slots used");
    expect(html).toContain("1 free");
    expect(html).toContain("Fort");
    expect(html).not.toContain("Income Sources");
    expect(html).not.toContain("in reserve");
  });

  it("distinguishes zero slot access from a fully-committed resource", () => {
    const zeroAccessHtml = renderEconomyPanelHtml({
      focus: "CRYSTAL",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(zeroAccessHtml).toContain("No access to this resource yet");

    const fullyCommittedHtml = renderEconomyPanelHtml({
      focus: "CRYSTAL",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(fullyCommittedHtml).toContain("Fully committed");
  });

  it("flags a dormant occupant in the 'Occupied by' column, matching the tile detail view's indicator", () => {
    const html = renderEconomyPanelHtml({
      focus: "TITANIUM",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [{ key: "0,0:fort", resources: ["TITANIUM"] }],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          fort: { ownerId: "me", status: "active", variant: "FORT" }
        }
      ],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("is-dormant");
    expect(html).toContain("economy-dormant-flag");
    expect(html).toContain("⚠ dormant");
  });

  it("does not double-report Relay Beacon food upkeep as a daily flow on the FOOD slot tab", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.FOOD.sinks = [{ label: "RELAY_BEACON", amountPerMinute: 0.4, count: 4 }];

    const html = renderEconomyPanelHtml({
      focus: "FOOD",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        // Only 1 of the 6 owned outposts bills a FOOD slot — the first
        // RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5) are waived (§23.2).
        supply: { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0.4, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 3, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 4, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 5, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } }
      ],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("RELAY_BEACON");
    expect(html).toContain("1 slot<");
    expect(html).not.toContain("6 slots");
    expect(html).not.toContain("No upkeep beyond the slots above");
    expect(html).not.toContain("RELAY_BEACON · 4");
    expect(html).not.toContain("-576.0/day");
    expect(html).not.toContain("576.0/day");
  });

  it("waives the FOOD slot entirely for Relay Beacons under the free-slot count", () => {
    const html = renderEconomyPanelHtml({
      focus: "FOOD",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } },
        { x: 3, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "me" } }
      ],
      economyBreakdown: undefined,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).not.toContain("RELAY_BEACON");
    expect(html).toContain("No structures using a FOOD slot yet");
  });

  it("keeps cross-resource flow upkeep (gold) on the GOLD card, not the slot tab", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.FOOD.sinks = [
      { label: "RELAY_BEACON", amountPerMinute: 0.4, count: 4 },
      { label: "Fur Synthesizer upkeep", amountPerMinute: 12, count: 1, resourceKey: "GOLD" }
    ];
    economyBreakdown.GOLD.sinks = [{ label: "Fur Synthesizer upkeep", amountPerMinute: 12, count: 1, resourceKey: "GOLD" }];

    const html = renderEconomyPanelHtml({
      focus: "ALL",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0.4, titanium: 0, umbrite: 0, crystal: 0, gold: 12 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: false,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Fur Synthesizer upkeep");
    expect(html).toContain("-17280.0/day");
    expect(html).not.toContain("RELAY_BEACON · 4");
    expect(html).not.toContain("-576.0/day");
  });

  // Regression coverage for a real bug: the economy panel showed the TITANIUM/
  // CRYSTAL/UMBRITE summary cards and detail breakdowns unconditionally,
  // revealing those resource categories exist before the player has
  // researched the tech that reveals them server-side (same bug already
  // fixed for the toolbar ribbon in client-panel-html.ts).
  it("hides TITANIUM/CRYSTAL/UMBRITE summary cards and detail sections when not revealed", () => {
    const html = renderEconomyPanelHtml({
      focus: "ALL",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown: emptyEconomyBreakdown(),
      isMobile: false,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type,
      isRevealed: (key) => key === "FOOD"
    });

    expect(html).toContain("data-economy-focus=\"GOLD\"");
    expect(html).toContain("data-economy-focus=\"FOOD\"");
    expect(html).not.toContain("data-economy-focus=\"TITANIUM\"");
    expect(html).not.toContain("data-economy-focus=\"CRYSTAL\"");
    expect(html).not.toContain("data-economy-focus=\"UMBRITE\"");
  });

  // Regression coverage: an Aether Condenser flipped into Sell Off (EXCHANGE)
  // mode reports its gold bucket labeled with the raw persisted structure
  // type (CRYSTAL_SYNTHESIZER, see player-update-economy.ts), not a display
  // name. The panel used to render that raw label verbatim in the shared-
  // breakdown path, so the income looked like it wasn't there at all unless
  // you knew to look for the internal type string.
  it("renders a structure-labeled GOLD income bucket under its display name, not its raw type", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.GOLD.sources = [{ label: "CRYSTAL_SYNTHESIZER", amountPerMinute: 5, count: 1 }];

    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 0,
      me: "me",
      incomePerMinute: 5,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1 },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Aether Condenser");
    expect(html).not.toContain("CRYSTAL_SYNTHESIZER");
  });
});
