import { describe, expect, it } from "vitest";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";
import type { TechInfo } from "../client-tech-info-types.js";

const tech = (id: string, name: string, branch: string): TechInfo => ({
  id,
  name,
  branch,
  tier: 1,
  description: "",
  mods: {},
  requirements: { gold: 0, resources: {} }
});

const techCatalog: TechInfo[] = [
  tech("masonry", "Titanium Forge Module", "war"),
  tech("workshops", "Umbrite Synthesis Module", "economy")
];

const deps = {
  state: { me: "me", techCatalog },
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

describe("menuOverviewForTile: AFC module overview", () => {
  it("summarises bay use and points at the Modules tab (the per-module detail lives there)", () => {
    const tile = {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      afc: { ownerId: "me", status: "active", modules: ["masonry", "workshops"] }
    } as Tile;
    const html = menuOverviewForTile(tile, deps).map((l) => l.html);
    expect(html).toContain("AFC Modules");
    expect(html).toContain("2/8 bays in use — see the Modules tab.");
  });

  it("shows a dormant banner for a captured (inactive) AFC", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "them", ownershipState: "SETTLED", afc: { ownerId: "them", status: "inactive", modules: ["masonry"] } } as Tile;
    const html = menuOverviewForTile(tile, deps).map((l) => l.html).join(" ");
    expect(html).toContain("Dormant");
  });

  it("falls back to an empty module list without throwing when techCatalog isn't threaded through", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"] } } as Tile;
    const bareDeps = { ...deps, state: { me: "me" } };
    expect(() => menuOverviewForTile(tile, bareDeps)).not.toThrow();
  });

  it("renders nothing AFC-specific for a tile without an afc", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    const html = menuOverviewForTile(tile, deps).map((l) => l.html);
    expect(html).not.toContain("AFC Modules");
  });
});
