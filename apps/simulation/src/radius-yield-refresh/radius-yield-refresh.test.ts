import { describe, expect, it } from "vitest";
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
  it("re-emits the owner's FARMSTEAD tiles within WATERWORKS_RADIUS when a WATERWORKS becomes active", () => {
    const farmstead = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: PLAYER_ID }
    });
    const previousWaterworks = settledTile(10, 5, {
      economicStructure: { type: "WATERWORKS", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextWaterworks = settledTile(10, 5, {
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["5,5", farmstead],
      ["10,5", nextWaterworks]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousWaterworks,
      next: nextWaterworks,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([farmstead, nextWaterworks])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["5,5"]);
  });

  it("re-emits the same FARMSTEAD when the WATERWORKS is removed (going inactive)", () => {
    const farmstead = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: PLAYER_ID }
    });
    const previousWaterworks = settledTile(10, 5, {
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const nextWaterworksGone: DomainTileState = { x: 10, y: 5, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    const tiles = new Map<string, DomainTileState>([
      ["5,5", farmstead],
      ["10,5", nextWaterworksGone]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousWaterworks,
      next: nextWaterworksGone,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([farmstead, nextWaterworksGone])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["5,5"]);
  });

  it("does not include a FARMSTEAD outside WATERWORKS_RADIUS", () => {
    const farFarmstead = settledTile(100, 100, {
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: PLAYER_ID }
    });
    const previousWaterworks = settledTile(10, 5, {
      economicStructure: { type: "WATERWORKS", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextWaterworks = settledTile(10, 5, {
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["100,100", farFarmstead],
      ["10,5", nextWaterworks]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "10,5",
      previous: previousWaterworks,
      next: nextWaterworks,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([farFarmstead, nextWaterworks])
    });

    expect(beneficiaries).toEqual([]);
  });

  it("re-emits the owner's MINE tiles within FOUNDRY_RADIUS when a FOUNDRY becomes active", () => {
    const mine = settledTile(8, 5, {
      resource: "IRON",
      economicStructure: { type: "MINE", status: "active", ownerId: PLAYER_ID }
    });
    const previousFoundry = settledTile(5, 5, {
      economicStructure: { type: "FOUNDRY", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextFoundry = settledTile(5, 5, {
      economicStructure: { type: "FOUNDRY", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["8,5", mine],
      ["5,5", nextFoundry]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "5,5",
      previous: previousFoundry,
      next: nextFoundry,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([mine, nextFoundry])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["8,5"]);
  });

  it("re-emits the adjacent owned dock when a CUSTOMS_HOUSE (Harbor Exchange) becomes active", () => {
    const dock = settledTile(6, 5, { dockId: "dock-a" });
    const previousCustomsHouse = settledTile(5, 5, {
      economicStructure: { type: "CUSTOMS_HOUSE", status: "under_construction", ownerId: PLAYER_ID }
    });
    const nextCustomsHouse = settledTile(5, 5, {
      economicStructure: { type: "CUSTOMS_HOUSE", status: "active", ownerId: PLAYER_ID }
    });
    const tiles = new Map<string, DomainTileState>([
      ["6,5", dock],
      ["5,5", nextCustomsHouse]
    ]);

    const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
      tileKey: "5,5",
      previous: previousCustomsHouse,
      next: nextCustomsHouse,
      tiles,
      dockLinksByDockTileKey: new Map(),
      settledTilesForPlayer: settledTilesForPlayerFrom([dock, nextCustomsHouse])
    });

    expect(beneficiaries.map((t) => `${t.x},${t.y}`)).toEqual(["6,5"]);
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
