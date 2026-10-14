import { describe, expect, it } from "vitest";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";
import type { TechInfo } from "../client-tech-info-types.js";
import techTree from "../../../game-domain/data/tech-tree.json" with { type: "json" };

const techCatalog: TechInfo[] = techTree.techs.map((tech) => ({
  id: tech.id,
  name: tech.name,
  tier: tech.tier,
  description: tech.description,
  mods: {},
  requirements: { gold: tech.cost.gold, resources: {} }
}));

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
  it.each(techCatalog)("uses the catalog name for a $id reward", (tech) => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: true, grantedEffect: "TECH", grantedTechId: tech.id } } as Tile;
    const html = menuOverviewForTile(tile, { ...deps, state: { ...deps.state, techCatalog } }).map((line) => line.html).join(" ");
    expect(html).toContain(`Unlocked ${tech.name}`);
  });

  it.each([[], techCatalog])("keeps a readable fallback when the reward is missing from the catalog", (catalog) => {
    const tile = { x: 1, y: 1, terrain: "LAND", waystation: { activated: true, grantedEffect: "TECH", grantedTechId: "future-tech" } } as Tile;
    const html = menuOverviewForTile(tile, {
      ...deps,
      state: { ...deps.state, techCatalog: catalog },
      prettyToken: (value) => value === "future-tech" ? "Future Tech" : value
    }).map((line) => line.html).join(" ");
    expect(html).toContain("Unlocked Future Tech");
  });

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
