import { describe, expect, it } from "vitest";
import { tileMenuViewForTile } from "./client-tile-menu-view.js";
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
  townPartialLoadingStartedAt: () => Date.now(), structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`
};

describe("foreign ownership headers", () => {
  it("shows the owner player name instead of enemy text for hostile land", () => {
    const menu = tileMenuViewForTile(
      {
        x: 106, y: 171, terrain: "LAND", ownerId: "enemy-1", ownershipState: "SETTLED", dockId: "dock-1", regionType: "ANCIENT_HEARTLAND"
      },
      {
        ...deps,
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy-1" ? "Ancient Rival" : ownerId ?? undefined),
        menuActionsForSingleTile: () => [],
        splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
        settlementProgressForTile: () => undefined,
        captureProgressForTile: () => undefined,
        queuedSettlementProgressForTile: () => undefined,
        queuedBuildProgressForTile: () => undefined,
        queuedExpandProgressForTile: () => undefined,
        queuedWaypointProgressForTile: () => undefined,
        queuedAutoSettleNextForTile: () => undefined,
        constructionProgressForTile: () => undefined,
        menuOverviewForTile: () => []
      }
    );

    expect(menu.subtitle).toBe("Owned by Ancient Rival · Settled territory · ANCIENT_HEARTLAND");
    // Any foreign owner's name is clickable (opens their profile card), ally or not.
    expect(menu.subtitleHtml).toEqual('Owned by <span class="tile-owner-label" data-player-name-id="enemy-1"><span class="player-name-text">Ancient Rival</span></span> · Settled territory · ANCIENT_HEARTLAND');
  });
  it("renders allied owner names with the ally subtitle accent", () => {
    const menu = tileMenuViewForTile(
      {
        x: 80,
        y: 120,
        terrain: "LAND",
        ownerId: "ally-1",
        ownershipState: "SETTLED",
        town: {
          name: "Harborlight",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 2,
          cap: 40,
          isFed: true,
          population: 18_000,
          maxPopulation: 50_000,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false,
        },
        regionType: "ANCIENT_HEARTLAND"
      },
      {
        ...deps,
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "ally-1" ? "Green Banner" : ownerId ?? undefined),
        isTileOwnedByAlly: () => true,
        menuActionsForSingleTile: () => [],
        splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
        settlementProgressForTile: () => undefined,
        captureProgressForTile: () => undefined,
        queuedSettlementProgressForTile: () => undefined,
        queuedBuildProgressForTile: () => undefined,
        queuedExpandProgressForTile: () => undefined,
        queuedWaypointProgressForTile: () => undefined,
        queuedAutoSettleNextForTile: () => undefined,
        constructionProgressForTile: () => undefined,
        menuOverviewForTile: () => []
      }
    );

    expect(menu.subtitle).toBe("Owned by Green Banner · Settled territory · ANCIENT_HEARTLAND");
  });

});
