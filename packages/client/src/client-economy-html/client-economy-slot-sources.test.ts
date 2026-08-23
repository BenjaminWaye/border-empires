import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

describe("renderEconomyPanelHtml — Slot Sources", () => {
  it("lists Slot Sources for a slot resource, mirroring GOLD's Income Sources", () => {
    const html = renderEconomyPanelHtml({
      focus: "TITANIUM",
      gold: 0,
      me: "me",
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 4, CRYSTAL: 0, UMBRITE: 0 },
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
          resource: "TITANIUM",
          economicStructure: { ownerId: "me", type: "MINE", status: "active" }
        },
        {
          x: 1,
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

    // base(1) + MINE same-tile boost(1) = 2 slots computed from the tile,
    // plus a 2-slot residual "Other bonuses" row to reconcile against the
    // authoritative supply of 4 (a domain-effect grant this client-side
    // re-derivation can't see, per the "Other bonuses" fallback).
    expect(html).toContain("Slot Sources");
    expect(html).toContain("TITANIUM");
    expect(html).toContain("+2 slots");
    expect(html).toContain("Other bonuses");
  });

  it("omits the Other bonuses row when the computed total already matches supply", () => {
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
          resource: "TITANIUM",
          economicStructure: { ownerId: "me", type: "MINE", status: "active" }
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

    expect(html).toContain("+2 slots");
    expect(html).not.toContain("Other bonuses");
  });
});
