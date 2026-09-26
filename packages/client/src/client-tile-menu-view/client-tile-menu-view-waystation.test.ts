import { describe, expect, it } from "vitest";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
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
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button>${label ?? type}</button>`
};

describe("menuOverviewForTile: waystation line", () => {
  it.each([
    ["unowned dormant", { x: 1, y: 1, terrain: "LAND", waystation: { activated: false } }],
    ["owned frontier active", { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: true, activatedByPlayerId: "me", grantedEffect: "VISION" } }]
  ] as Array<[string, Tile]>)("renders for %s", (_name, tile) => {
    const html = menuOverviewForTile(tile, deps).map((l) => l.html).join(" ");
    expect(html).toContain("Status:");
  });

  it("leads with the waystation and adds no generic frontier boilerplate", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: false } } as Tile;
    const html = menuOverviewForTile(tile, deps).map((l) => l.html);
    expect(html[0]).toBe("Waystation");
    expect(html.some((h) => h.includes("Frontier land"))).toBe(false);
  });

  it("leads with the Built line on a settled structure tile", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" } } as Tile;
    expect(menuOverviewForTile(tile, deps)[0]?.html).toContain("Built:");
  });
});
