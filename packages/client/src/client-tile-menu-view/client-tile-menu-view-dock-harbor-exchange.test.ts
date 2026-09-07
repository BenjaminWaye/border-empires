// Regression: tile.dock?.goldPerMinute is never populated over the wire in
// production (only appears in test fixtures), so the tile menu's "Dock
// income" line must fall back to a value that reflects the connection bonus
// and the Harbor Exchange (CUSTOMS_HOUSE) bonus -- not a flat per-dock
// constant that ignored both, as it did before dockDisplayGoldPerMinute.
import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

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
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now()
};

const dockTile: Tile = {
  x: 12,
  y: 8,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  dockId: "dock-3"
};

describe("menuOverviewForTile Dock income fallback", () => {
  it("reflects the connection bonus and Harbor Exchange bonus when the server hasn't sent goldPerMinute", () => {
    const flatLines = menuOverviewForTile(dockTile, {
      ...deps,
      connectedDockCountForTile: () => 0,
      dockSupportedByCustomsHouseForTile: () => false
    });
    // Base-only: DOCK_INCOME_PER_MIN (0.5/288) * 1440 = 2.5 gold/day.
    expect(flatLines.some((line) => line.html === "Dock income 2.5 gold/day")).toBe(true);

    const connectedLines = menuOverviewForTile(dockTile, {
      ...deps,
      connectedDockCountForTile: () => 2,
      dockSupportedByCustomsHouseForTile: () => false
    });
    // Connection bonus only: (0.5/288) * (1 + 0.5*2) * 1440 = 5 gold/day.
    expect(connectedLines.some((line) => line.html === "Dock income 5.0 gold/day")).toBe(true);

    const harborLines = menuOverviewForTile(dockTile, {
      ...deps,
      connectedDockCountForTile: () => 2,
      dockSupportedByCustomsHouseForTile: () => true
    });
    // Connection bonus + Harbor Exchange bonus: 5 + (1/288)*2*1440 = 15 gold/day.
    expect(harborLines.some((line) => line.html === "Dock income 15.0 gold/day")).toBe(true);
    expect(harborLines.some((line) => line.html.includes("Connected to 2 docks"))).toBe(true);
  });
});
