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

describe("menuOverviewForTile: AFC tiles", () => {
  // The Modules tab (socket diagram) is the AFC's overview and renders these
  // lines beneath it, so the module list must not be repeated as text.
  it("does not duplicate the docked module list shown by the Modules tab", () => {
    const tile = {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      afc: { ownerId: "me", status: "active", modules: ["masonry", "workshops"] }
    } as Tile;
    const html = menuOverviewForTile(tile, deps).map((l) => l.html).join(" ");
    expect(html).not.toContain("AFC Modules");
    expect(html).not.toContain("Titanium Forge Module");
    expect(html).toContain("Manage AFC upgrades");
  });

  it("does not throw when techCatalog isn't threaded through", () => {
    const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"] } } as Tile;
    const bareDeps = { ...deps, state: { me: "me" } };
    expect(() => menuOverviewForTile(tile, bareDeps)).not.toThrow();
  });

  it("only offers Manage AFC upgrades on AFCs the player owns", () => {
    const foreign = { x: 1, y: 1, terrain: "LAND", ownerId: "them", ownershipState: "SETTLED", afc: { ownerId: "them", status: "inactive", modules: ["masonry"] } } as Tile;
    const plain = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    for (const tile of [foreign, plain]) {
      expect(menuOverviewForTile(tile, deps).map((l) => l.html).join(" ")).not.toContain("Manage AFC upgrades");
    }
  });
});
