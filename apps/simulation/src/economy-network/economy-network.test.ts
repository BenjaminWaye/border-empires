import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { DOCK_INCOME_PER_MIN } from "@border-empires/game-domain";
import {
  buildConnectedTownNetworkForPlayer,
  dockBaseGoldPerMinuteForPlayer,
  dockSupportedByCustomsHouse,
  HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK,
  type EconomyPlayer
} from "./economy-network.js";
import {
  addSettledTileToConnectivity,
  createTownConnectivityState,
  markTownConnectivityDirty
} from "./town-connectivity-incremental.js";

const townTile = (x: number, y: number, name: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: {
    name,
    type: "FARMING",
    populationTier: "TOWN"
  }
});

const settlementTile = (x: number, y: number, name: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: {
    name,
    type: "FARMING",
    populationTier: "SETTLEMENT"
  }
});

describe("connected town network", () => {
  it("computes connected town counts by settled-land component", () => {
    const tiles = new Map<string, DomainTileState>(
      [
        townTile(0, 0, "Alpha"),
        townTile(1, 0, "Beta"),
        townTile(10, 10, "Gamma")
      ].map((tile) => [`${tile.x},${tile.y}`, tile])
    );

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get("0,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownNames: ["Beta"]
    });
    expect(network.get("1,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownNames: ["Alpha"]
    });
    expect(network.get("10,10")).toMatchObject({
      connectedTownCount: 0
    });
  });

  it("can suppress connected town names while preserving counts and bonuses", () => {
    const tiles = new Map<string, DomainTileState>(
      [
        townTile(0, 0, "Alpha"),
        townTile(1, 0, "Beta"),
        townTile(2, 0, "Gamma")
      ].map((tile) => [`${tile.x},${tile.y}`, tile])
    );

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values(),
      { maxConnectedTownNames: 0 }
    );

    expect(network.get("0,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownBonus: 0.5
    });
    expect(network.get("0,0")?.connectedTownNames).toBeUndefined();
  });

  it("does not count a town as connected when only reachable through another town", () => {
    // Three towns in a line, each separated by a non-town settled land tile.
    // Layout: Alpha(0,0) — land(1,0) — Beta(2,0) — land(3,0) — Gamma(4,0)
    const landTile = (x: number, y: number): DomainTileState => ({
      x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED"
    });

    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", landTile(1, 0)],
      ["2,0", townTile(2, 0, "Beta")],
      ["3,0", landTile(3, 0)],
      ["4,0", townTile(4, 0, "Gamma")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    // Alpha and Gamma each connect to Beta only — not to each other.
    expect(network.get("0,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
    expect(network.get("2,0")).toMatchObject({ connectedTownCount: 2, connectedTownNames: ["Alpha", "Gamma"] });
    expect(network.get("4,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
  });

  it("does not count SETTLEMENT-tier towns toward another town's connectedTownCount", () => {
    // Two real towns each adjacent to a settlement, and to each other via a
    // shared corridor tile. The settlements must not appear in either real
    // town's connected count/names, and must not appear as entries themselves.
    const landTile = (x: number, y: number): DomainTileState => ({
      x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED"
    });
    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", landTile(1, 0)],
      ["2,0", townTile(2, 0, "Beta")],
      ["0,1", settlementTile(0, 1, "Alpha's Hamlet")],
      ["2,1", settlementTile(2, 1, "Beta's Hamlet")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get("0,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
    expect(network.get("2,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Alpha"] });
    expect(network.has("0,1")).toBe(false);
    expect(network.has("2,1")).toBe(false);
  });

  it("lets a SETTLEMENT act as a pass-through corridor tile instead of a connectivity barrier", () => {
    // Alpha — settlement — Beta, in a straight line. Before excluding
    // settlements from the barrier/node set, the settlement tile would have
    // blocked this path (BFS stops at town tiles); now it's just corridor.
    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", settlementTile(1, 0, "Waystation")],
      ["2,0", townTile(2, 0, "Beta")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get("0,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
    expect(network.get("2,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Alpha"] });
    expect(network.has("1,0")).toBe(false);
  });

  it("short-circuits with a zeroed entry when the player has 0 or 1 TOWN-tier-or-higher towns, ignoring settlements", () => {
    // One real town plus several settlements: settlements can never push a
    // real town's count above 0 here (there's no OTHER real town to connect
    // to), so this must take the short-circuit path and return a plain
    // zeroed entry rather than running the corridor BFS.
    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", settlementTile(1, 0, "Hamlet A")],
      ["2,0", settlementTile(2, 0, "Hamlet B")],
      ["3,0", settlementTile(3, 0, "Hamlet C")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get("0,0")).toEqual({ connectedTownCount: 0, connectedTownBonus: 0 });
    expect(network.size).toBe(1);
  });

  it("short-circuits to an empty map when the player has zero TOWN-tier-or-higher towns", () => {
    const tiles = new Map<string, DomainTileState>([
      ["0,0", settlementTile(0, 0, "Hamlet A")],
      ["1,0", settlementTile(1, 0, "Hamlet B")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.size).toBe(0);
  });

  it("connects multiple towns through a shared corridor component to a shared group descriptor", () => {
    // Four towns in a star around a single corridor tile at (1,1).
    //     T_0,2       T_2,2
    //         \       /
    //       C(1,1) — corridor
    //         /       \
    //     T_0,0       T_2,0
    //
    // T_0,0 has an adjacent SUPPORT tile (0,-1) with a Clearing House.
    // hasSupportedStructure checks 8-neighbor support tiles, not the town itself.
    const landTile = (x: number, y: number): DomainTileState => ({
      x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED"
    });

    const chTownKey = "0,0";
    const supportTile: DomainTileState = {
      x: 0, y: -1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "CLEARING_HOUSE" as const, status: "active" as const }
    };

    const tiles = new Map<string, DomainTileState>([
      [chTownKey, townTile(0, 0, "CH-Town")],
      ["0,2", townTile(0, 2, "North")],
      ["2,2", townTile(2, 2, "East")],
      ["2,0", townTile(2, 0, "South")],
      ["1,1", landTile(1, 1)],
      ["0,-1", supportTile]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    // Every town is connected to all three other towns (one shared corridor group).
    for (const key of ["0,0", "0,2", "2,2", "2,0"]) {
      expect(network.get(key)!).toMatchObject({
        connectedTownCount: 3,
        connectedTownBonus: 1.2 // 0.5 + 0.4 + 0.3 = 1.2 for 3 connected towns
      });
    }

    // CH-Town (0,0) itself should NOT list its own Clearing House.
    expect(network.get(chTownKey)!.connectedClearingHouseKeys).toBeUndefined();

    // Other three towns should see the Clearing House at (0,0).
    expect(network.get("0,2")!.connectedClearingHouseKeys).toEqual([chTownKey]);
    expect(network.get("2,2")!.connectedClearingHouseKeys).toEqual([chTownKey]);
    expect(network.get("2,0")!.connectedClearingHouseKeys).toEqual([chTownKey]);
  });

  it("computes connectivity in O(N) for large empires (regression: O(K^2) pairwise loop removed)", () => {
    // 1000 corridor tiles + 100 towns in one giant connected component.
    // Layout stays within [0,199] range to avoid WORLD_WIDTH wrapping issues.
    const tiles = new Map<string, DomainTileState>();
    const townCount = 100;
    const corridorCount = 1000;

    // Place 100 towns in a 10x10 grid at (0,0) through (9,9) × 2 spacing.
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const key = `${x * 2},${y * 2}`;
        tiles.set(key, townTile(x * 2, y * 2, `Town${y * 10 + x}`));
      }
    }
    // Fill the rest of the 20x20 bounding box with corridor tiles.
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (x % 2 === 0 && y % 2 === 0) continue; // town position, skip
        const key = `${x},${y}`;
        tiles.set(key, { x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" } as DomainTileState);
      }
    }

    const start = performance.now();
    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );
    const durationMs = performance.now() - start;

    // Every town should be connected to all 99 others through the shared grid.
    const firstTown = network.get("0,0")!;
    expect(firstTown.connectedTownCount).toBe(townCount - 1);
    expect(firstTown.connectedTownBonus).toBe(1.2);

    // Should complete in well under 500ms — old O(K^2) was multiple seconds.
    expect(durationMs).toBeLessThan(500);
  });
});

describe("Harbor Exchange (CUSTOMS_HOUSE) dock income", () => {
  const player: EconomyPlayer = { id: "player-1", techIds: [], domainIds: [] };

  const dockTile = (x: number, y: number, dockId: string): DomainTileState => ({
    x, y, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", dockId
  });

  it("dockSupportedByCustomsHouse is false with no adjacent CUSTOMS_HOUSE", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", dockTile(10, 10, "dock-a")]]);
    expect(dockSupportedByCustomsHouse("10,10", player.id, tiles)).toBe(false);
  });

  it("dockSupportedByCustomsHouse is true when an adjacent tile has an active owned CUSTOMS_HOUSE", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockTile(10, 10, "dock-a")],
      ["11,10", {
        x: 11, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED",
        economicStructure: { type: "CUSTOMS_HOUSE", status: "active", ownerId: player.id }
      }]
    ]);
    expect(dockSupportedByCustomsHouse("10,10", player.id, tiles)).toBe(true);
  });

  it("dockSupportedByCustomsHouse ignores an inactive (under-construction) CUSTOMS_HOUSE", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockTile(10, 10, "dock-a")],
      ["11,10", {
        x: 11, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED",
        economicStructure: { type: "CUSTOMS_HOUSE", status: "under_construction", ownerId: player.id }
      }]
    ]);
    expect(dockSupportedByCustomsHouse("10,10", player.id, tiles)).toBe(false);
  });

  it("dockBaseGoldPerMinuteForPlayer grants base income only when not supported by a Harbor Exchange", () => {
    const dockA = dockTile(10, 10, "dock-a");
    const dockB = dockTile(50, 50, "dock-b");
    const tiles = new Map<string, DomainTileState>([["10,10", dockA], ["50,50", dockB]]);
    const dockLinksByDockTileKey = new Map([["10,10", ["50,50"]], ["50,50", ["10,10"]]]);

    const income = dockBaseGoldPerMinuteForPlayer(dockA, player, { tiles, dockLinksByDockTileKey });
    // Base DOCK_INCOME_PER_MIN * (1 + 0.5 per connected dock) with 1 connected dock, no Harbor Exchange bonus.
    expect(income).toBeCloseTo(DOCK_INCOME_PER_MIN * 1.5, 6);
  });

  it("dockBaseGoldPerMinuteForPlayer adds +1 gold/min per connected owned dock when supported by an active Harbor Exchange", () => {
    const dockA = dockTile(10, 10, "dock-a");
    const dockB = dockTile(50, 50, "dock-b");
    const customsHouse: DomainTileState = {
      x: 11, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED",
      economicStructure: { type: "CUSTOMS_HOUSE", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockA],
      ["50,50", dockB],
      ["11,10", customsHouse]
    ]);
    const dockLinksByDockTileKey = new Map([["10,10", ["50,50"]], ["50,50", ["10,10"]]]);

    const incomeWithoutExchange = dockBaseGoldPerMinuteForPlayer(dockA, player, {
      tiles: new Map([["10,10", dockA], ["50,50", dockB]]),
      dockLinksByDockTileKey
    });
    const incomeWithExchange = dockBaseGoldPerMinuteForPlayer(dockA, player, { tiles, dockLinksByDockTileKey });

    // +1 gold/min * 1 connected owned dock, additive on top of the base income.
    expect(incomeWithExchange - incomeWithoutExchange).toBeCloseTo(HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK * 1, 6);
  });

  it("dockBaseGoldPerMinuteForPlayer's Harbor Exchange bonus scales with connectedOwnedDockCount", () => {
    const dockA = dockTile(10, 10, "dock-a");
    const dockB = dockTile(50, 50, "dock-b");
    const dockC = dockTile(60, 60, "dock-c");
    const customsHouse: DomainTileState = {
      x: 11, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED",
      economicStructure: { type: "CUSTOMS_HOUSE", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockA],
      ["50,50", dockB],
      ["60,60", dockC],
      ["11,10", customsHouse]
    ]);
    // dock-a is linked to both dock-b and dock-c (2 connected owned docks).
    const dockLinksByDockTileKey = new Map([
      ["10,10", ["50,50", "60,60"]],
      ["50,50", ["10,10"]],
      ["60,60", ["10,10"]]
    ]);

    const incomeWithoutExchange = dockBaseGoldPerMinuteForPlayer(dockA, player, {
      tiles: new Map([["10,10", dockA], ["50,50", dockB], ["60,60", dockC]]),
      dockLinksByDockTileKey
    });
    const incomeWithExchange = dockBaseGoldPerMinuteForPlayer(dockA, player, { tiles, dockLinksByDockTileKey });

    expect(incomeWithExchange - incomeWithoutExchange).toBeCloseTo(HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK * 2, 6);
  });
});

describe("connected town network — incremental state fast path", () => {
  const player: EconomyPlayer = { id: "player-1", techIds: [], domainIds: [] };

  it("produces the same result as the from-scratch BFS when the incremental state is dirty (forces a rebuild)", () => {
    const tiles = new Map<string, DomainTileState>(
      [
        townTile(0, 0, "Alpha"),
        townTile(1, 0, "Beta"),
        townTile(10, 10, "Gamma")
      ].map((tile) => [`${tile.x},${tile.y}`, tile])
    );

    const fromScratch = buildConnectedTownNetworkForPlayer(player, tiles);

    const state = createTownConnectivityState();
    const withIncremental = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { incrementalState: state });

    expect(withIncremental).toEqual(fromScratch);
    expect(state.dirty).toBe(false);
  });

  it("reuses a fresh incremental state without rebuilding, and reflects an incrementally-added town", () => {
    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", townTile(1, 0, "Beta")]
    ]);

    const state = createTownConnectivityState();
    const first = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { incrementalState: state });
    expect(first.get("0,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
    expect(state.dirty).toBe(false);

    // Simulate the runtime-tile-index-maintenance hook: a new town settles
    // adjacent to Beta, incrementally unioned in rather than forcing a
    // rebuild.
    const gamma = townTile(2, 0, "Gamma");
    tiles.set("2,0", gamma);
    addSettledTileToConnectivity(state, "2,0");
    expect(state.dirty).toBe(false);

    const second = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { incrementalState: state });
    expect(second.get("0,0")).toMatchObject({ connectedTownCount: 2 });
    expect(second.get("2,0")).toMatchObject({ connectedTownCount: 2 });
  });

  it("forces a full rebuild after markTownConnectivityDirty instead of trusting stale unions", () => {
    // Alpha and Gamma are only connected through Beta as a direct-adjacency
    // bridge (Alpha<->Gamma are not themselves adjacent).
    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", townTile(1, 0, "Beta")],
      ["2,0", townTile(2, 0, "Gamma")]
    ]);

    const state = createTownConnectivityState();
    const before = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { incrementalState: state });
    expect(before.get("0,0")).toMatchObject({ connectedTownCount: 2 });

    // Beta is captured/abandoned. A plain union-find can't un-union
    // incrementally, so this must mark dirty rather than silently keep
    // reporting Alpha<->Gamma as connected through a bridge that no longer
    // exists.
    tiles.delete("1,0");
    markTownConnectivityDirty(state);

    const rebuilt = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { incrementalState: state });
    expect(rebuilt.get("0,0")).toEqual({ connectedTownCount: 0, connectedTownBonus: 0 });
    expect(rebuilt.get("2,0")).toEqual({ connectedTownCount: 0, connectedTownBonus: 0 });
    expect(rebuilt.has("1,0")).toBe(false);
  });
});
