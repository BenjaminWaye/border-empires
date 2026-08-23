import { describe, expect, it } from "vitest";

import { resourceSlotProductionHtml } from "./client-tile-resource-slot-production.js";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: (ownerId?: string | null) => ownerId ?? undefined,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[],
  townPartialLoadingStartedAt: () => Date.now()
};

describe("resourceSlotProductionHtml", () => {
  it("returns the base FOOD slot count for a bare FARM tile", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "FARM" })).toBe("🍞 Food +1");
  });

  it("returns the higher FISH base slot count", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "FISH" })).toBe("🍞 Food +2");
  });

  it("adds a Farmstead's +1 own-tile boost on top of the FARM base", () => {
    const tile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      resource: "FARM",
      economicStructure: { ownerId: "me", type: "FARMSTEAD", status: "active" }
    };
    expect(resourceSlotProductionHtml(tile)).toBe("🍞 Food +2");
  });

  it("returns TITANIUM/CRYSTAL/UMBRITE slot counts for the corresponding tile resources", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "TITANIUM" })).toBe("⛏ Titanium +1");
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "GEMS" })).toBe("💎 Crystal +1");
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "UMBRITE" })).toBe("🟣 Umbrite +1");
  });

  it("returns an empty string for a tile with no recognized resource", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND" })).toBe("");
  });
});

describe("menuOverviewForTile — settled resource node production line", () => {
  it("shows a Production: slot line for a settled FARM tile instead of stale 'once developed and collected' prose", () => {
    const farmTile: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" };
    const html = menuOverviewForTile(farmTile, deps).map((line) => line.html).join(" ");
    expect(html).not.toContain("once developed and collected");
    expect(html).toContain("Production: 🍞 Food +1");
  });

  it("does not show a Production: slot line for a FRONTIER (unsettled) resource tile", () => {
    const farmTile: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" };
    const html = menuOverviewForTile(farmTile, deps).map((line) => line.html).join(" ");
    expect(html).not.toContain("Production: 🍞 Food");
  });
});
