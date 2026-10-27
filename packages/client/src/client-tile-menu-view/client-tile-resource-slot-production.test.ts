import { describe, expect, it } from "vitest";

import { resourceSlotProductionHtml } from "./client-tile-resource-slot-production.js";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";

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
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`
};

describe("resourceSlotProductionHtml", () => {
  it("returns the base FOOD slot count for a bare FARM tile", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "FARM" })).toBe(`${resourceIconHtml("FOOD")} Food +1`);
  });

  it("returns the higher FISH base slot count", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "FISH" })).toBe(`${resourceIconHtml("FOOD")} Food +2`);
  });

  it("adds a Hydrogarden's +2 own-tile boost on top of the FARM base", () => {
    const tile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      resource: "FARM",
      economicStructure: { ownerId: "me", type: "HYDROGARDEN", status: "active" }
    };
    expect(resourceSlotProductionHtml(tile)).toBe(`${resourceIconHtml("FOOD")} Food +3`);
  });

  it("returns TITANIUM/CRYSTAL/UMBRITE slot counts for the corresponding tile resources", () => {
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "TITANIUM" })).toBe(`${resourceIconHtml("TITANIUM")} Titanium +1`);
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "GEMS" })).toBe(`${resourceIconHtml("CRYSTAL")} Crystal +1`);
    expect(resourceSlotProductionHtml({ x: 0, y: 0, terrain: "LAND", resource: "UMBRITE" })).toBe(`${resourceIconHtml("UMBRITE")} Umbrite +1`);
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
    expect(html).toContain(`Production: ${resourceIconHtml("FOOD")} Food +1`);
  });

  it("does not show a Production: slot line for a FRONTIER (unsettled) resource tile", () => {
    const farmTile: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" };
    const html = menuOverviewForTile(farmTile, deps).map((line) => line.html).join(" ");
    expect(html).not.toContain(`Production: ${resourceIconHtml("FOOD")} Food`);
  });
});

describe("every resource tile explains its role", () => {
  it.each(["FARM", "FISH", "TITANIUM", "GEMS", "UMBRITE", ...NETWORK_RESOURCES] as const)("describes %s in the real tile overview", resource => {
    for (const ownership of [undefined, "FRONTIER", "SETTLED"] as const) {
      const tile: Tile = {x:1,y:1,terrain:"LAND",resource,...(ownership ? {ownerId:"me",ownershipState:ownership} : {})};
      const lines = menuOverviewForTile(tile, deps).map(row => row.html).join(" ");
      expect(lines.length).toBeGreaterThan(100);
      if (NETWORK_RESOURCES.some(kind => kind === resource)) {
        const spec = RESOURCE_NETWORKS[resource as keyof typeof RESOURCE_NETWORKS];
        expect(lines).toContain(spec.description);
        expect(lines).toContain(spec.buildingName);
        expect(lines).toContain("alone provides no industrial bonus");
        expect(lines).not.toMatch(/Claim and garrison this tile to start producing/);
      } else expect(lines).toContain("Base supply:");
    }
  });
  it("describes a visible coastal fishing marker before the sea early return", () => {
    expect(menuOverviewForTile({x:1,y:1,terrain:"COASTAL_SEA",resource:"FISH"},deps).map(row=>row.html).join(" ")).toContain("Coastal fishing grounds");
  });
  it("does not call an unfinished or inactive extractor a working supplier", () => {
    const tile: Tile = {x:1,y:1,terrain:"LAND",resource:"NEURAL_RESIN",ownerId:"me",ownershipState:"SETTLED",
      economicStructure:{ownerId:"me",type:"RESIN_EXTRACTOR",status:"under_construction"}};
    expect(menuOverviewForTile(tile,deps).map(row=>row.html).join(" ")).toContain("supply starts after completion");
    tile.economicStructure!.status="active";
    expect(menuOverviewForTile(tile,deps).map(row=>row.html).join(" ")).toContain("Inactive or unpowered sites provide no supply");
  });
});

it("does not count an unfinished, inactive or legacy fish Hydrogarden as a source boost",()=>{
  for(const status of ["under_construction","inactive","removing"] as const) {
    expect(resourceSlotProductionHtml({x:1,y:1,terrain:"LAND",resource:"FARM",economicStructure:{ownerId:"me",type:"HYDROGARDEN",status}})).toContain("Food +1");
  }
  expect(resourceSlotProductionHtml({x:1,y:1,terrain:"LAND",resource:"FISH",economicStructure:{ownerId:"me",type:"HYDROGARDEN",status:"active"}})).toContain("Food +2");
});
it("reports diverted resource supply and explains the Siphon on frontier sites",()=>{
  const sabotage={ownerId:"enemy",observatoryTileKey:"5,5",endsAt:Number.MAX_SAFE_INTEGER,outputMultiplier:0};
  const tile:Tile={x:1,y:1,terrain:"LAND",resource:"FARM",ownerId:"me",ownershipState:"SETTLED",sabotage};
  expect(resourceSlotProductionHtml(tile)).toContain("Food +0 (siphoned)");
  tile.resource="NEURAL_RESIN";
  expect(menuOverviewForTile(tile,deps).map(row=>row.html).join(" ")).toContain("Supply diverted by an active Siphon");
});
