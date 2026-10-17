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
  // Regression: Hydroworks/Ore Refinery radius boosts only fed the retired
  // per-tile strategic yield, so their beneficiaries carry no server-computed
  // value — re-emitting them on every source toggle was wasted broadcast.
  it("does not re-emit HYDROGARDEN or MINE tiles when a HYDROWORKS or ORE_REFINERY changes", () => {
    const hydrogarden = settledTile(5, 5, {
      resource: "FARM",
      economicStructure: { type: "HYDROGARDEN", status: "active", ownerId: PLAYER_ID }
    });
    const mine = settledTile(8, 5, {
      resource: "TITANIUM",
      economicStructure: { type: "MINE", status: "active", ownerId: PLAYER_ID }
    });
    for (const type of ["HYDROWORKS", "ORE_REFINERY"] as const) {
      const previous = settledTile(6, 5, { economicStructure: { type, status: "under_construction", ownerId: PLAYER_ID } });
      const next = settledTile(6, 5, { economicStructure: { type, status: "active", ownerId: PLAYER_ID } });
      const tiles = new Map<string, DomainTileState>([
        ["5,5", hydrogarden],
        ["8,5", mine],
        ["6,5", next]
      ]);

      const beneficiaries = radiusYieldRefreshBeneficiaryTiles({
        tileKey: "6,5",
        previous,
        next,
        tiles,
        dockLinksByDockTileKey: new Map(),
        settledTilesForPlayer: settledTilesForPlayerFrom([hydrogarden, mine, next])
      });

      expect(beneficiaries).toEqual([]);
    }
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
