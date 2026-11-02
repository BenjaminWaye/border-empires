import { describe, expect, it } from "vitest";

import { tileMenuViewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";

const card = (title: string): TileMenuProgressView => ({ title, detail: "", remainingLabel: "", progress: 0, note: "" });
const fort = card("Fortification under construction");
const hydrogarden = card("Hydrogarden queued");

const deps = (progress: { construction?: TileMenuProgressView; queuedBuild?: TileMenuProgressView }) => ({
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: () => undefined,
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
  queuedBuildProgressForTile: () => progress.queuedBuild,
  queuedExpandProgressForTile: () => undefined,
  queuedWaypointProgressForTile: () => undefined,
  queuedAutoSettleNextForTile: () => undefined,
  constructionProgressForTile: () => progress.construction,
  menuOverviewForTile: () => []
});

const tile: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };

describe("tileMenuViewForTile work", () => {
  // Regression: `progress` holds one card, so a Fort being built hid the
  // support building queued behind it on the same tile.
  it("lists construction and the queued build together, construction first", () => {
    const view = tileMenuViewForTile(tile, deps({ construction: fort, queuedBuild: hydrogarden }));
    expect(view.work).toEqual([fort, hydrogarden]);
    expect(view.progress).toBe(hydrogarden);
  });

  it("has no work when nothing is running or queued", () => {
    expect(tileMenuViewForTile(tile, deps({})).work).toBeUndefined();
  });
});
