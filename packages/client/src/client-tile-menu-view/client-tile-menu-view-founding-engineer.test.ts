import { describe, expect, it } from "vitest";

import { tileActionMenuHtml } from "../client-tile-menu-html.js";
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
  queuedAutoSettleNextForTile: () => undefined,
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

    expect(menu.subtitleHtml ?? "").not.toContain("founding-engineer-name");
  });
});

describe("tileMenuViewForTile ownership help", () => {
  it("makes the ownership label expandable on own and unclaimed land, with no body kicker", () => {
    const own = tileMenuViewForTile({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }, { ...deps, state: { me: "me" } });
    expect(own.subtitleHtml).toContain("<summary>Your frontier</summary>");
    expect(own.subtitleHtml).toContain('class="is-current"><strong>Frontier.');
    expect(tileMenuViewForTile({ x: 1, y: 1, terrain: "LAND" }, { ...deps, state: { me: "me" } }).subtitleHtml).toContain("<summary>Unclaimed</summary>");
    expect((own as Record<string, unknown>).overviewKicker).toBeUndefined();
  });
});


describe("battle state in the overview tab", () => {
  it.each(["Battle in progress", "Under attack", "Battle resolved"])("shows %s even when overview is selected", (title) => {
    const progress = { title, detail: "Combat", remainingLabel: "0:02", progress: 0.5, note: "Combat timing" };
    const menu = tileMenuViewForTile({ x: 1, y: 1, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }, {
      ...deps, captureProgressForTile: () => progress
    });
    expect(menu.tabs).toContain("progress");
    expect(menu.statusText).toBe(title);
    expect(menu.progress).toEqual(progress);
    expect(menu.overviewLines).toContainEqual({ html: title });
    expect(menu.subtitle).toContain("Settled territory");
    expect(menu.subtitleHtml).toContain("Settled territory");
    expect(menu.overviewLines).toContainEqual({ html: "Combat (0:02)" });
    expect(tileActionMenuHtml(menu, "overview", false)).toContain(title);
    expect(tileActionMenuHtml(menu, "overview", true)).toContain("Combat (0:02)");
  });
});


it("keeps settlement progress available while explaining the resolved map animation", () => {
  const battle = { title: "Battle resolved", detail: "You won", remainingLabel: "0:02", progress: 1, note: "Animation finishing" };
  const settlement = { title: "Settling", detail: "Settling land", remainingLabel: "0:10", progress: 0.2, note: "Settlement" };
  const menu = tileMenuViewForTile({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }, {
    ...deps, captureProgressForTile: () => battle, settlementProgressForTile: () => settlement
  });
  expect(menu.progress).toEqual(settlement);
  expect(menu.overviewLines).toContainEqual({ html: "Battle resolved" });
});
