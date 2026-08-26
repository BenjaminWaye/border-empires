import { describe, expect, it } from "vitest";

import { tileMenuViewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

const FOUNDING_ENGINEER_PLAYER_ID = "VK5iriJAhickNf9ArrRweUDnq1W2";

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: (ownerId?: string | null) => (ownerId === FOUNDING_ENGINEER_PLAYER_ID ? "KonradsDelikatessKörv" : (ownerId ?? undefined)),
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
  menuActionsForSingleTile: () => [],
  splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
  settlementProgressForTile: () => undefined,
  captureProgressForTile: () => undefined,
  queuedSettlementProgressForTile: () => undefined,
  queuedBuildProgressForTile: () => undefined,
  queuedExpandProgressForTile: () => undefined,
  queuedWaypointProgressForTile: () => undefined,
  constructionProgressForTile: () => undefined,
  menuOverviewForTile: () => []
};

describe("tileMenuViewForTile founding-engineer badge", () => {
  it("shows the founding-engineer badge on their foreign land tile's owner label", () => {
    const menu = tileMenuViewForTile({ x: 12, y: 12, terrain: "LAND", ownerId: FOUNDING_ENGINEER_PLAYER_ID, ownershipState: "SETTLED" }, deps);

    expect(menu.subtitleHtml).toContain("founding-engineer-name");
    expect(menu.subtitleHtml).toContain("KonradsDelikatessKörv");
  });

  // Regression: the founding-engineer check used to run on foreignOwnerLabel
  // without the ally check's terrain/self guard, so a SEA/COASTAL_SEA tile
  // they owned (e.g. a dock) rendered the badge next to the generic "Open
  // sea"/"Crossing route" text instead of skipping it like ownerLabelIsAlly does.
  it("does not show the founding-engineer badge on their owned sea tile", () => {
    const menu = tileMenuViewForTile({ x: 12, y: 13, terrain: "SEA", ownerId: FOUNDING_ENGINEER_PLAYER_ID }, deps);

    expect(menu.subtitleHtml).toBeUndefined();
    expect(menu.subtitle).toBe("Open sea");
  });

  it("does not show the founding-engineer badge on their own tile from the viewer's perspective", () => {
    const menu = tileMenuViewForTile({ x: 12, y: 14, terrain: "LAND", ownerId: FOUNDING_ENGINEER_PLAYER_ID, ownershipState: "SETTLED" }, {
      ...deps,
      state: { me: FOUNDING_ENGINEER_PLAYER_ID }
    });

    expect(menu.subtitleHtml).toBeUndefined();
  });
});
