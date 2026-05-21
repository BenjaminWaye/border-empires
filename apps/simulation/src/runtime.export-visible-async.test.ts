import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { yieldToEventLoop } from "./event-loop-yield.js";

// Pins the contract that exportVisibleStateForPlayerAsync produces output
// identical to the sync exportVisibleStateForPlayer for the same inputs.
// The async variant exists so PR #343's chunked-enrichment pipeline can
// be fed without a multi-second classifyVisibility + visible-tile-map
// stall on the bootstrap path — output equivalence is the load-bearing
// invariant, otherwise the bridge callers would silently see a different
// snapshot shape than the in-process callers.
const makePlayer = (id: string, territoryKeys: string[]) => ({
  id,
  isAi: false,
  points: 100,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("SimulationRuntime exportVisibleStateForPlayerAsync (parity)", () => {
  it("produces identical output to the sync variant for a multi-chunk territory", async () => {
    // Big enough to cross TILE_CHUNK = 500 so the async path actually
    // yields mid-loop. 25x25 owned area + visibility radius 5 → ~250k
    // cells in the visibility raster, ~1k visible tiles after dedup +
    // map → multiple chunks.
    const tiles: Array<{
      x: number;
      y: number;
      terrain: "LAND" | "SEA";
      ownerId?: string;
      ownershipState?: "SETTLED" | "FRONTIER";
    }> = [];
    const territoryKeys: string[] = [];
    for (let x = 0; x < 25; x += 1) {
      for (let y = 0; y < 25; y += 1) {
        tiles.push({
          x,
          y,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: (x + y) % 3 === 0 ? "SETTLED" : "FRONTIER"
        });
        territoryKeys.push(`${x},${y}`);
      }
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", territoryKeys)]]),
      initialState: {
        tiles,
        activeLocks: []
      }
    });

    const syncOut = runtime.exportVisibleStateForPlayer("player-1");
    const asyncOut = await runtime.exportVisibleStateForPlayerAsync("player-1", yieldToEventLoop);

    // JSON-stringify equality covers nested structures and ordering, which
    // both matter downstream of the bridge.
    expect(JSON.stringify(asyncOut)).toEqual(JSON.stringify(syncOut));
  });

  it("yields to the event loop between tile chunks", async () => {
    const tiles: Array<{
      x: number;
      y: number;
      terrain: "LAND" | "SEA";
      ownerId?: string;
      ownershipState?: "SETTLED" | "FRONTIER";
    }> = [];
    const territoryKeys: string[] = [];
    for (let x = 0; x < 25; x += 1) {
      for (let y = 0; y < 25; y += 1) {
        tiles.push({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
        territoryKeys.push(`${x},${y}`);
      }
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", territoryKeys)]]),
      initialState: { tiles, activeLocks: [] }
    });

    let yields = 0;
    const tracked = async (): Promise<void> => {
      yields += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
    };
    await runtime.exportVisibleStateForPlayerAsync("player-1", tracked);
    // 1 post-classify yield + 1 post-tile-sort yield + at least 1 mid-loop
    // yield (≥500 visible tiles with 25x25 territory + radius 5) = ≥3.
    expect(yields).toBeGreaterThanOrEqual(3);
  });
});
