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
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button data-structure-info="${type}">${label ?? type}</button>`,
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
};

// Playtest 2026-11-27 (grandparent): a fogged tile keeps the owner it had when last seen. It read
// "Unclaimed" although another House had taken it, and Expand To there turned into an attack.
describe("fogged neutral tile ownership label", () => {
  it("says the tile was only last seen unclaimed", () => {
    const menu = tileMenuViewForTile({ x: 14, y: 16, terrain: "LAND", fogged: true, regionType: "DEEP_FOREST" }, deps);
    expect(menu.subtitle).toBe("Last seen unclaimed · DEEP_FOREST");
    expect(menu.subtitleHtml).toContain("<summary>Last seen unclaimed</summary>");
    expect(menu.subtitleHtml).toContain("may have an owner now");
  });

  it("keeps Unclaimed for a neutral tile in vision", () => {
    const menu = tileMenuViewForTile({ x: 14, y: 16, terrain: "LAND", fogged: false }, deps);
    expect(menu.subtitle).toBe("Unclaimed");
    expect(menu.subtitleHtml).not.toContain("Last seen");
  });
});
