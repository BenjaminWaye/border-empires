import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import type { DomainInfo } from "../client-tech-info-types.js";
import { domainSlotGrantFor, slotSourcesForResource } from "./client-economy-slot-sources.js";

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
      resourceIconHtml: (resource) => resource,
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
      resourceIconHtml: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("+2 slots");
    expect(html).not.toContain("Other bonuses");
  });

  const titaniumArgs = (supply: number, tiles: Parameters<typeof renderEconomyPanelHtml>[0]["tiles"], domainSlotGrant?: { label: string; resource: "TITANIUM"; count: number }): Parameters<typeof renderEconomyPanelHtml>[0] => ({
    focus: "TITANIUM", gold: 0, me: "me", incomePerMinute: 0,
    strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }, storageCap: EMPIRE_STORAGE_FLOOR,
    resourceSlots: { supply: { FOOD: 0, TITANIUM: supply, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } },
    dormantStructures: [], strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 }, upkeepLastTick: { foodCoverage: 1 },
    activeRevealTargetsCount: 0, tiles, economyBreakdown: undefined, isMobile: true,
    prettyToken: (value) => value.charAt(0) + value.slice(1).toLowerCase(), resourceIconHtml: (resource) => resource,
    rateToneClass: () => "positive", resourceLabel: (resource) => resource, economicStructureName: (type) => type,
    ...(domainSlotGrant ? { domainSlotGrant } : {})
  });

  it("labels resource tiles as sites", () => {
    const tile = (x: number) => ({ x, y: 0, terrain: "LAND" as const, ownerId: "me", ownershipState: "SETTLED" as const, resource: "TITANIUM" as const });
    expect(slotSourcesForResource(titaniumArgs(2, [tile(0), tile(1)]), "TITANIUM")).toEqual([{ label: "Titanium sites", amountPerMinute: 2, count: 2 }]);
  });

  // Regression: an AFC upgrade's chosen-resource grant showed as "Other bonuses".
  it("names the AFC upgrade that grants the slots instead of Other bonuses", () => {
    const sources = slotSourcesForResource(titaniumArgs(2, [], { label: "Forge Charter", resource: "TITANIUM", count: 2 }), "TITANIUM");
    expect(sources).toEqual([{ label: "Forge Charter", amountPerMinute: 2, count: 1 }]);
  });

  it("finds the installed upgrade with a chosen-resource grant", () => {
    const requirements = { gold: 0, resources: {} };
    const catalog: DomainInfo[] = [
      { id: "a", tier: 1, name: "Plain", description: "", requiresTechId: "", mods: {}, requirements },
      { id: "b", tier: 2, name: "Forge Charter", description: "", requiresTechId: "", mods: {}, effects: { chosenResourceSlotGrant: 2 }, requirements }
    ];
    expect(domainSlotGrantFor(catalog, ["a", "b"], "TITANIUM")).toEqual({ label: "Forge Charter", resource: "TITANIUM", count: 2 });
    expect(domainSlotGrantFor(catalog, ["a", "b"], undefined)).toBeUndefined();
    expect(domainSlotGrantFor(catalog, ["a"], "TITANIUM")).toBeUndefined();
  });
});
