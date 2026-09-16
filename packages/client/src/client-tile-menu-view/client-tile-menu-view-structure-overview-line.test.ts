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
  structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`
};

describe("menuOverviewForTile: 'Built:' structure overview line", () => {
  it("shows a 'Built:' line with a clickable structure-info link for a tile with a structure on it", () => {
    const lines = menuOverviewForTile(
      { x: 90, y: 329, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" } },
      deps
    );
    const html = lines.map((line) => line.html).join(" ");
    expect(html).toContain("Built:");
    expect(html).toContain('<button data-structure-info="MINTWORKS">MINTWORKS</button>');
  });

  it("omits the 'Built:' line when no structure is on the tile", () => {
    const lines = menuOverviewForTile({ x: 91, y: 330, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }, deps);
    expect(lines.some((line) => line.html.includes("Built:"))).toBe(false);
  });
});
