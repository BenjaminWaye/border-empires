import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { applyEncirclement, type RuntimeEncirclementApplicationContext } from "./runtime-encirclement-application.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

// Home dock (10,10) with a settled hinterland; across the sea, a two-tile
// beachhead (50,51)-(50,52) landed from it. The sea lane links the home dock
// and the beach tile (see packages/shared dock-landing).
const seaLanes = new Map<string, readonly string[]>([
  ["10,10", ["50,51"]],
  ["50,51", ["10,10"]]
]);

const harness = (tiles: Map<string, DomainTileState>) => {
  const context: RuntimeEncirclementApplicationContext = {
    tiles,
    now: () => 1_000,
    activeAetherBridgesForPlayer: () => [],
    seaLaneNeighborKeysByTileKey: seaLanes,
    replaceTileState: (tileKey, tile) => {
      tiles.set(tileKey, tile);
    },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
    emitEvent: () => {},
    runtimeLogInfo: () => {},
    registerFrontierAutoHeal: () => {}
  };
  return context;
};

const world = (homeDockOwner: string): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  const put = (tile: DomainTileState) => tiles.set(`${tile.x},${tile.y}`, tile);
  put({ x: 10, y: 10, terrain: "LAND", ownerId: homeDockOwner, ownershipState: "SETTLED", dockId: "dock-a" });
  for (let x = 11; x <= 14; x += 1) put({ x, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
  put({ x: 50, y: 50, terrain: "LAND", dockId: "dock-b" });
  put({ x: 50, y: 51, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
  put({ x: 50, y: 52, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
  return tiles;
};

describe("applyEncirclement — dock sea lanes", () => {
  it("keeps a beachhead while its home dock is held", () => {
    const tiles = world("player-1");
    // Losing an unrelated settled tile re-checks the empire; the beachhead
    // reaches supply through the sea lane to the home dock.
    tiles.set("14,10", { x: 14, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    applyEncirclement(harness(tiles), ["14,10", "50,52"], "player-1", "cmd-1");
    expect(tiles.get("50,51")?.ownerId).toBe("player-1");
    expect(tiles.get("50,52")?.ownerId).toBe("player-1");
  });

  it("strands the whole beachhead the moment its home dock is captured", () => {
    const tiles = world("player-2");
    applyEncirclement(harness(tiles), ["10,10"], "player-1", "cmd-1");
    expect(tiles.get("50,51")?.ownerId).toBeUndefined();
    expect(tiles.get("50,52")?.ownerId).toBeUndefined();
    expect(tiles.get("11,10")?.ownerId).toBe("player-1");
  });

  it("strands the beachhead even when the home empire is too big for the region BFS", () => {
    // bfsCap 1 makes computeEncirclementDeltas bail, as it does whenever the
    // home dock sits inside a large empire; the sea-lane check still runs.
    const tiles = world("player-2");
    applyEncirclement(harness(tiles), ["10,10"], "player-1", "cmd-1", { bfsCap: 1 });
    expect(tiles.get("50,51")?.ownerId).toBeUndefined();
    expect(tiles.get("50,52")?.ownerId).toBeUndefined();
  });

  it("keeps a captured far dock and the beach beside it when the home dock falls", () => {
    // A FRONTIER dock is its own supply point (stranded-frontier-finder
    // isTerminal), so holding the far harbour keeps the landing beside it
    // whatever happens to the dock it sailed from.
    const tiles = world("player-2");
    tiles.set("50,50", { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-b" });
    applyEncirclement(harness(tiles), ["10,10"], "player-1", "cmd-1", { bfsCap: 1 });
    expect(tiles.get("50,50")?.ownerId).toBe("player-1");
    expect(tiles.get("50,51")?.ownerId).toBe("player-1");
    expect(tiles.get("50,52")?.ownerId).toBe("player-1");
  });
});
