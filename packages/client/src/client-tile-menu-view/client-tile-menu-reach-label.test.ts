import { describe, expect, it } from "vitest";
import { rivalReachLabel } from "./client-tile-menu-reach-label.js";
import { tileMenuViewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

const names: Record<string, string> = { "rival-1": "Ancient Rival", "evil-1": "<b>Evil</b>" };
const nameFor = (ownerId?: string | null): string | undefined => (ownerId ? names[ownerId] : undefined);

describe("rivalReachLabel", () => {
  it("labels unowned land inside a rival's reach", () => {
    expect(rivalReachLabel({ terrain: "LAND", reachOwnerId: "rival-1" }, "me", nameFor)?.text).toBe("Inside Ancient Rival's reach");
  });
  it("escapes the player name in the html twin", () => {
    const html = rivalReachLabel({ terrain: "LAND", reachOwnerId: "evil-1" }, "me", nameFor)?.html;
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });
  it("ignores owned tiles, your own reach, barbarian reach, water and tiles with no reach", () => {
    expect(rivalReachLabel({ terrain: "LAND", ownerId: "rival-1", reachOwnerId: "rival-1" }, "me", nameFor)).toBeUndefined();
    expect(rivalReachLabel({ terrain: "LAND", reachOwnerId: "me" }, "me", nameFor)).toBeUndefined();
    expect(rivalReachLabel({ terrain: "LAND", reachOwnerId: "barbarian-1" }, "me", nameFor)).toBeUndefined();
    expect(rivalReachLabel({ terrain: "SEA", reachOwnerId: "rival-1" }, "me", nameFor)).toBeUndefined();
    expect(rivalReachLabel({ terrain: "LAND" }, "me", nameFor)).toBeUndefined();
  });
});

const viewDeps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: nameFor,
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

describe("tile menu header for ground inside a rival's reach", () => {
  it("says whose reach it is instead of 'Unclaimed'", () => {
    const menu = tileMenuViewForTile({ x: 10, y: 11, terrain: "LAND", reachOwnerId: "rival-1" }, viewDeps);
    expect(menu.subtitle).toBe("Inside Ancient Rival's reach");
    expect(menu.subtitleHtml).toContain("Inside Ancient Rival&#39;s reach");
    expect(menu.subtitleHtml).not.toContain(">Unclaimed<");
  });
  it("keeps 'Unclaimed' for neutral ground outside every reach and inside your own", () => {
    expect(tileMenuViewForTile({ x: 10, y: 11, terrain: "LAND" }, viewDeps).subtitle).toBe("Unclaimed");
    expect(tileMenuViewForTile({ x: 10, y: 11, terrain: "LAND", reachOwnerId: "me" }, viewDeps).subtitle).toBe("Unclaimed");
  });
  it("escapes a hostile player name in the header html", () => {
    const menu = tileMenuViewForTile({ x: 10, y: 11, terrain: "LAND", reachOwnerId: "evil-1" }, viewDeps);
    expect(menu.subtitleHtml).not.toContain("<b>Evil");
  });
});
