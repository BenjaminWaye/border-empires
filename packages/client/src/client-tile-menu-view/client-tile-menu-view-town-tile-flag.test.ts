import { describe, expect, it } from "vitest";
import { tileMenuViewForTile } from "./client-tile-menu-view.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// The view identifies the town tile itself, separately from its support ring.
const menuFor = (tile: Tile) => {
  const state = createInitialState();
  state.me = "me";
  return tileMenuViewForTile(tile, {
    state,
    prettyToken: (value: string) => value,
    playerNameForOwner: (ownerId?: string | null) => ownerId ?? undefined,
    terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
    isTileOwnedByAlly: () => false,
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
  });
};

const town: NonNullable<Tile["town"]> = {
  type: "MARKET",
  baseGoldPerMinute: 1,
  supportCurrent: 0,
  supportMax: 4,
  goldPerMinute: 1,
  cap: 100,
  isFed: true,
  population: 1000,
  maxPopulation: 5000,
  populationTier: "TOWN",
  connectedTownCount: 0,
  connectedTownBonus: 0,
  hasManufactory: false,
  manufactoryActive: false,
  hasIncubationEngine: false,
  incubationEngineActive: false
};

describe("tileMenuViewForTile isTownTile", () => {
  it("flags the town tile itself", () => {
    expect(menuFor({ x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town }).isTownTile).toBe(true);
  });

  it("leaves a support-ring tile unflagged", () => {
    expect(menuFor({ x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }).isTownTile).toBeUndefined();
  });
});
