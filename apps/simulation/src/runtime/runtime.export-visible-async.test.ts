import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { yieldToEventLoop } from "../event-loop-yield.js";

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
    // 25x25 owned area + visibility radius 5 → ~250k cells in the
    // visibility raster, ~1k visible tiles after dedup. Just under
    // TILE_CHUNK=2000 so it exercises the async path without mid-loop yields.
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
    // 50x50 = 2500 owned tiles, which crosses TILE_CHUNK=2000 so the loop
    // yields at least once mid-chunk in addition to the post-classify and
    // post-tile-sort structural yields → total ≥ 3.
    for (let x = 0; x < 50; x += 1) {
      for (let y = 0; y < 50; y += 1) {
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
    // 1 post-classify yield + 1 post-tile-sort yield + ≥1 mid-loop yield
    // (2500 owned tiles crosses TILE_CHUNK=2000) = ≥3.
    expect(yields).toBeGreaterThanOrEqual(3);
  });

  // Regression: the sim's event_loop_blocked diagnostic showed
  // mainThreadTasks: [] during real >3s stalls on large-empire bootstraps
  // because classifyVisibilityForPlayer's vision-expansion-cache-miss cost
  // (and, on the same bootstrap path, cachedEconomySnapshot's rebuild) weren't
  // wrapped in trackSyncMainThreadTask. Pins that both wrappers are actually
  // invoked (with the right phase names) whenever the tracker is supplied,
  // and that omitting it still works (backward compatible for callers/tests
  // that don't care about instrumentation).
  it("wraps classifyVisibilityForPlayer and cachedEconomySnapshot in trackSyncMainThreadTask when provided", async () => {
    const territoryKeys = ["0,0", "1,0", "0,1"];
    const tracked: Array<{ phase: string; details: unknown }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", territoryKeys)]]),
      initialState: {
        tiles: territoryKeys.map((key) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const };
        }),
        activeLocks: []
      },
      trackSyncMainThreadTask: (phase, details, task) => {
        tracked.push({ phase, details });
        return task();
      }
    });

    await runtime.exportVisibleStateForPlayerAsync("player-1", yieldToEventLoop);

    const phases = tracked.map((entry) => entry.phase);
    expect(phases).toContain("classify_visibility_for_player");
    expect(phases).toContain("cached_economy_snapshot_rebuild");
    const classify = tracked.find((entry) => entry.phase === "classify_visibility_for_player");
    expect(classify?.details).toEqual({ playerId: "player-1" });
    const economySnapshot = tracked.find((entry) => entry.phase === "cached_economy_snapshot_rebuild");
    expect(economySnapshot?.details).toEqual({ playerId: "player-1" });
  });

  it("still produces correct output when trackSyncMainThreadTask is not provided", async () => {
    const territoryKeys = ["0,0", "1,0", "0,1"];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", territoryKeys)]]),
      initialState: {
        tiles: territoryKeys.map((key) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const };
        }),
        activeLocks: []
      }
    });

    const out = await runtime.exportVisibleStateForPlayerAsync("player-1", yieldToEventLoop);
    expect(out.tiles.length).toBeGreaterThan(0);
  });
});
