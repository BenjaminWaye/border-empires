import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// Abandoning a tile (UNCAPTURE_TILE) leaves a fort/tower/economic structure
// standing but inert -- abandonedStructureFields in
// capture-structures.ts -- so its status field can still read "active" even
// though tile.ownerId no longer matches the structure record's ownerId.
// These regression-cover the overview lines that must not claim the
// structure is still doing anything on a tile like that.
const baseDeps = {
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
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now()
};

const linesFor = (tile: Tile): string[] => menuOverviewForTile(tile, baseDeps).map((line) => line.html);

describe("menuOverviewForTile — structures left standing on an abandoned tile", () => {
  it("shows the Aether Tower as inactive, not blocking hostile crystal actions", () => {
    const lines = linesFor({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: undefined,
      ownershipState: undefined,
      observatory: { ownerId: "former-owner", status: "active" }
    } as unknown as Tile);
    expect(lines.some((line) => line.includes("blocks hostile crystal actions"))).toBe(false);
    expect(lines.some((line) => line.includes("Aether Tower is inactive here"))).toBe(true);
  });

  it("still shows the Aether Tower as active and protecting when the tile is actually owned by it", () => {
    const lines = linesFor({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as unknown as Tile);
    expect(lines.some((line) => line.includes("blocks hostile crystal actions"))).toBe(true);
  });

  it("omits the Weapons Factory's own-empire bonus line once the tile is no longer owned by the structure's owner", () => {
    const lines = linesFor({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: undefined,
      ownershipState: undefined,
      economicStructure: { ownerId: "former-owner", type: "TITANIUM_WEAPONS_FACTORY", status: "active" }
    } as unknown as Tile);
    expect(lines.some((line) => line.includes("contributes") && line.includes("your empire"))).toBe(false);
  });

  it("still shows the Weapons Factory bonus line for a structure the viewer actually owns", () => {
    const lines = linesFor({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "TITANIUM_WEAPONS_FACTORY", status: "active" }
    } as unknown as Tile);
    expect(lines.some((line) => line.includes("contributes") && line.includes("your empire"))).toBe(true);
  });
});
