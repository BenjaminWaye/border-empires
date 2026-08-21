import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// §14.2: dormant/unpowered structure indicator. Kept in a dedicated file
// rather than added to client-tile-menu-view.test.ts, which is already well
// over the repo's 500-line soft cap.
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

const fortTile: Tile = {
  x: 5,
  y: 5,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  fort: { ownerId: "me", status: "active" }
};

describe("menuOverviewForTile — §14.2 dormant structure indicator", () => {
  it("renders a dormant line naming the resource and count when the fort is TITANIUM-short", () => {
    const lines = menuOverviewForTile(fortTile, {
      ...baseDeps,
      dormantResourcesForTile: () => ["TITANIUM"]
    });
    const dormantLine = lines.find((line) => line.html.includes("tile-overview-dormant"));
    expect(dormantLine?.html).toContain("Dormant");
    expect(dormantLine?.html).toContain("1 Titanium slot");
    expect(dormantLine?.html).toContain("a Titanium tile");
  });

  it("renders nothing extra when the structure is powered", () => {
    const lines = menuOverviewForTile(fortTile, {
      ...baseDeps,
      dormantResourcesForTile: () => undefined
    });
    expect(lines.some((line) => line.html.includes("tile-overview-dormant"))).toBe(false);
  });

  it("falls back to no dormancy line when the caller doesn't supply dormantResourcesForTile at all", () => {
    const lines = menuOverviewForTile(fortTile, baseDeps);
    expect(lines.some((line) => line.html.includes("tile-overview-dormant"))).toBe(false);
  });

  it("names both resources for a structure dormant on more than one", () => {
    const dormantTile: Tile = {
      x: 6,
      y: 6,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FOUNDRY", status: "active" }
    };
    const lines = menuOverviewForTile(dormantTile, {
      ...baseDeps,
      dormantResourcesForTile: () => ["FOOD", "CRYSTAL"]
    });
    const dormantLine = lines.find((line) => line.html.includes("tile-overview-dormant"));
    expect(dormantLine?.html).toContain("1 Food slot");
    expect(dormantLine?.html).toContain("1 Crystal slot");
  });

  it("does not show a dormancy line for a structure that isn't active (e.g. still under construction)", () => {
    const observatoryTile: Tile = {
      x: 7,
      y: 7,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "under_construction" }
    };
    const lines = menuOverviewForTile(observatoryTile, {
      ...baseDeps,
      dormantResourcesForTile: () => ["CRYSTAL"]
    });
    expect(lines.some((line) => line.html.includes("tile-overview-dormant"))).toBe(false);
  });
});
