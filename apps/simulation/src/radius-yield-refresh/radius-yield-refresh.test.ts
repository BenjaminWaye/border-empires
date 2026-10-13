import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { radiusYieldRefreshBeneficiaryTiles } from "./radius-yield-refresh.js";

const PLAYER_ID = "player-1";

const settledTile = (
  x: number,
  y: number,
  extra: Partial<DomainTileState> = {}
): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  ...extra
});

const settledTilesForPlayerFrom = (tiles: readonly DomainTileState[]) => (playerId: string): readonly DomainTileState[] =>
  tiles.filter((tile) => tile.ownerId === playerId);

describe("radiusYieldRefreshBeneficiaryTiles", () => {
  it("re-emits the owner's HYDROGARDEN tiles within HYDROWORKS_RADIUS when a HYDROWORKS becomes active", () => {
    const hydrogarden = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "HYDROGARDEN", status: "active", ownerId: PLAYER_ID }
    });
    const previousHydroworks = settledTile(10, 5, {
      economicStructure: { type: "HYDROWORKS", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextHydroworks = settledTile(10, 5, {
      economicStructure: { type: "HYDROWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["5,5", hydrogarden],
      ["10,5", nextHydroworks]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousHydroworks,
      next: nextHydroworks,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([hydrogarden, nextHydroworks])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["5,5"]);
  });

  it("re-emits the same HYDROGARDEN when the HYDROWORKS is removed (going inactive)", () => {
    const hydrogarden = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "HYDROGARDEN", status: "active", ownerId: PLAYER_ID }
    });
    const previousHydroworks = settledTile(10, 5, {
      economicStructure: { type: "HYDROWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const nextHydroworksGone: DomainTileState = { x: 10, y: 5, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    const tiles = new Map<string, DomainTileState>([
      ["5,5", hydrogarden],
      ["10,5", nextHydroworksGone]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousHydroworks,
      next: nextHydroworksGone,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([hydrogarden, nextHydroworksGone])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["5,5"]);
  });

  it("does not include a HYDROGARDEN outside HYDROWORKS_RADIUS", () => {
    const farHydrogarden = settledTile(100, 100, {
      resource: "FARM",
      economicStructure: { type: "HYDROGARDEN", status: "active", ownerId: PLAYER_ID }
    });
    const previousHydroworks = settledTile(10, 5, {
      economicStructure: { type: "HYDROWORKS", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextHydroworks = settledTile(10, 5, {
      economicStructure: { type: "HYDROWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["100,100", farHydrogarden],
      ["10,5", nextHydroworks]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousHydroworks,
      next: nextHydroworks,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([farHydrogarden, nextHydroworks])
    });

    expect(beneficiaries).toEqual([]);
  });

  it("re-emits the owner's MINE tiles within ORE_REFINERY_RADIUS when a ORE_REFINERY becomes active", () => {
    const mine = settledTile(8, 5, {
      resource: "TITANIUM",
      economicStructure: { type: "MINE", status: "active", ownerId: PLAYER_ID }
    });
    const previousOreRefinery = settledTile(5, 5, {
      economicStructure: { type: "ORE_REFINERY", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextOreRefinery = settledTile(5, 5, {
      economicStructure: { type: "ORE_REFINERY", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["8,5", mine],
      ["5,5", nextOreRefinery]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "5,5",
      previous: previousOreRefinery,
      next: nextOreRefinery,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([mine, nextOreRefinery])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["8,5"]);
  });

  it("re-emits the adjacent owned dock when a HARBOR_EXCHANGE (Harbor Exchange) becomes active", () => {
    const dock = settledTile(6, 5, { dockId: "dock-a" });
    const previousHarborExchange = settledTile(5, 5, {
      economicStructure: { type: "HARBOR_EXCHANGE", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextHarborExchange = settledTile(5, 5, {
      economicStructure: { type: "HARBOR_EXCHANGE", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["6,5", dock],
      ["5,5", nextHarborExchange]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "5,5",
      previous: previousHarborExchange,
      next: nextHarborExchange,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([dock, nextHarborExchange])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["6,5"]);
  });

  it("re-emits an adjacent owned dock across the world's x-seam (wraps like dockSupportedByHarborExchange)", () => {
    // A dock at x=WORLD_WIDTH-1 and a Harbor Exchange at x=0 are adjacent via
    // wraparound (Chebyshev distance 1), even though the raw
    // |(WORLD_WIDTH-1)-0| = WORLD_WIDTH-1 is not.
    const seamX = WORLD_WIDTH - 1;
    const dock = settledTile(seamX, 5, { dockId: "dock-a" });
    const previousHarborExchange = settledTile(0, 5, {
      economicStructure: { type: "HARBOR_EXCHANGE", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextHarborExchange = settledTile(0, 5, {
      economicStructure: { type: "HARBOR_EXCHANGE", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      [`${seamX},5`, dock],
      ["0,5", nextHarborExchange]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "0,5",
      previous: previousHarborExchange,
      next: nextHarborExchange,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([dock, nextHarborExchange])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual([`${seamX},5`]);
  });

  it("re-emits connected owned dock tiles when a dock's settled/owned status changes", () => {
    const dockA = settledTile(1, 1, { dockId: "dock-a" });
    const previousDockB = settledTile(20, 20, { dockId: "dock-b" });
    const nextDockB = settledTile(20, 20, { dockId: "dock-b" });
    const tiles = new Map<string, DomainTileState>([
      ["1,1", dockA],
      ["20,20", nextDockB]
    ]);
    const dockLinksByDockTileKey = new Map<string, readonly string[]>([
      ["1,1", ["20,20"]],
      ["20,20", ["1,1"]]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "20,20",
      previous: { ...previousDockB, ownershipState: "FRONTIER" as const, ownerId: undefined },
      next: nextDockB,
      tiles,
      dockLinksByDockTileKey,
      settledTilesForPlayer: settledTilesForPlayerFrom([dockA, nextDockB])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["1,1"]);
  });

  it("refreshes both old and new beneficiaries when a tile's structure type swaps directly between two projecting types", () => {
    // A direct HYDROWORKS -> ORE_REFINERY swap in one mutation (no intermediate
    // removal) must not be treated as a no-op just because both are
    // "some active projecting source" -- the Hydrogarden should lose its
    // boost and the Mine should gain one, in the same refresh.
    const hydrogarden = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "HYDROGARDEN", status: "active", ownerId: PLAYER_ID }
    });
    const mine = settledTile(8, 5, {
      resource: "TITANIUM",
      economicStructure: { type: "MINE", status: "active", ownerId: PLAYER_ID }
    });
    const previousHydroworks = settledTile(6, 5, {
      economicStructure: { type: "HYDROWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const nextOreRefinery = settledTile(6, 5, {
      economicStructure: { type: "ORE_REFINERY", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["5,5", hydrogarden],
      ["8,5", mine],
      ["6,5", nextOreRefinery]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "6,5",
      previous: previousHydroworks,
      next: nextOreRefinery,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([hydrogarden, mine, nextOreRefinery])
    });

    const keys = beneficiaries.map((t) => `${t.x},${t.y}`).sort();
    expect(keys).toEqual(["5,5", "8,5"]);
  });

  it("returns an empty array (fast no-op) for an unrelated mutation with no projecting source or dock change", () => {
    const previous = settledTile(1, 1, { resource: "FARM" });
    const next = settledTile(1, 1, { resource: "FARM" });

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "1,1",
      previous,
      next,
      tiles: new Map([["1,1", next]]),
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([next])
    });

    expect(beneficiaries).toEqual([]);
  });
});
