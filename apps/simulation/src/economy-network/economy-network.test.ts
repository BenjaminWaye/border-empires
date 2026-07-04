import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildConnectedTownNetworkForPlayer } from "./economy-network.js";

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
