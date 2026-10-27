import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR, emptyResourceSlotSources, type ResourceSlotSources } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import { slotSourcesForResource } from "./client-economy-slot-sources.js";

type PanelArgs = Parameters<typeof renderEconomyPanelHtml>[0];

const titaniumArgs = (supply: number, sources: ResourceSlotSources | undefined, tiles: PanelArgs["tiles"] = []): PanelArgs => ({
  focus: "TITANIUM", gold: 0, me: "me", incomePerMinute: 0,
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }, storageCap: EMPIRE_STORAGE_FLOOR,
  resourceSlots: {
    supply: { FOOD: 0, TITANIUM: supply, CRYSTAL: 0, UMBRITE: 0 },
    demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    ...(sources ? { sources } : {})
  },
  dormantStructures: [], strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
  upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 }, upkeepLastTick: { foodCoverage: 1 },
  activeRevealTargetsCount: 0, tiles, economyBreakdown: undefined, isMobile: true,
  prettyToken: (value) => value, resourceIconHtml: (resource) => resource,
  rateToneClass: () => "positive", resourceLabel: (resource) => resource, economicStructureName: (type) => type,
  slotSourceNames: { domainName: (id) => (id === "afc-exchequer-2" ? "Exchequer II" : undefined), playerName: (id) => (id === "p2" ? "Rival" : undefined) }
});

const titaniumSources = (...rows: ResourceSlotSources["TITANIUM"]): ResourceSlotSources => ({ ...emptyResourceSlotSources(), TITANIUM: rows });

describe("Economy Slot Sources", () => {
  // Regression: sources were re-derived from the client's loaded tiles (only the area around the
  // camera), so off-screen ore sites and server-only grants showed as "Other bonuses".
  it("shows the server's rows even when none of the tiles are loaded", () => {
    const sources = titaniumSources(
      { kind: "TILE", id: "TITANIUM", slots: 2, count: 2 },
      { kind: "WAYSTATION", id: "", slots: 1, count: 1 },
      { kind: "SIPHON", id: "p2", slots: 1, count: 1 },
      { kind: "FOUNDRY_HEART", id: "", slots: 1, count: 1 }
    );
    expect(slotSourcesForResource(titaniumArgs(5, sources), "TITANIUM")).toEqual([
      { label: "Titanium sites", amountPerMinute: 2, count: 2 },
      { label: "Foundry Heart", amountPerMinute: 1, count: 1 },
      { label: "Siphon from Rival", amountPerMinute: 1, count: 1 },
      { label: "Waystation", amountPerMinute: 1, count: 1 }
    ]);
    const html = renderEconomyPanelHtml(titaniumArgs(5, sources));
    expect(html).toContain("Titanium sites");
    expect(html).not.toContain("Other bonuses");
  });

  it("names structure boosts, upgrades and techs", () => {
    const sources = titaniumSources(
      { kind: "TILE", id: "TITANIUM", slots: 1, count: 1 },
      { kind: "STRUCTURE_BOOST", id: "MINE", slots: 1, count: 1 },
      { kind: "STRUCTURE_BOOST", id: "ORE_REFINERY", slots: 2, count: 1 },
      { kind: "UPGRADE", id: "afc-exchequer-2", slots: 1, count: 1 },
      { kind: "TECH", id: "agriculture", slots: 1, count: 1 }
    );
    expect(slotSourcesForResource(titaniumArgs(6, sources), "TITANIUM").map((b) => b.label)).toEqual(
      ["Ore Refinery", "Agrarian Works", "Exchequer II", "Mine", "Titanium site"]
    );
  });

  it("ignores loaded tiles; the rows are the whole story", () => {
    const tiles: PanelArgs["tiles"] = [{ x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "TITANIUM" }];
    expect(slotSourcesForResource(titaniumArgs(0, titaniumSources(), tiles), "TITANIUM")).toEqual([]);
  });

  it("falls back to the total when the server sent no rows", () => {
    expect(slotSourcesForResource(titaniumArgs(3, undefined), "TITANIUM")).toEqual([{ label: "Slots", amountPerMinute: 3, count: 1 }]);
    expect(slotSourcesForResource(titaniumArgs(0, undefined), "TITANIUM")).toEqual([]);
  });
});
