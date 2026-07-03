import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the event_loop_blocked incidents that showed mainThreadTasks: []
// during real multi-second stalls even after PR #786 wrapped
// classifyVisibilityForPlayer — the tick functions (tileShedding,
// territoryAutomation) and command handlers ALSO drive applyEconomyAccrual
// (→ consumeUpkeepFromTileYield → tileYieldEconomyContextForPlayer's
// O(settled_tiles + towns²) BFS rebuild), and none of that chain was wrapped
// in trackSyncMainThreadTask. Pins that both phases fire when the tracker is
// supplied, via the same tickTileShedding path exercised by the existing
// "simulation runtime — tile shedding" suite in runtime.test.ts.
describe("simulation runtime — economy accrual instrumentation", () => {
  const buildRuntime = (
    trackSyncMainThreadTask: (phase: string, details: Record<string, string | number | boolean | null> | undefined, task: () => unknown) => unknown
  ) => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 10_000,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      },
      trackSyncMainThreadTask: (phase, details, task) => trackSyncMainThreadTask(phase, details, task) as ReturnType<typeof task>
    });
    return {
      runtime,
      advanceAndTick: async (nextNowMs: number) => {
        now = nextNowMs;
        await runtime.tickTileShedding(nextNowMs);
      }
    };
  };

  it("wraps applyEconomyAccrual in trackSyncMainThreadTask when driven by tickTileShedding", async () => {
    const tracked: Array<{ phase: string; details: unknown }> = [];
    const { advanceAndTick } = buildRuntime((phase, details, task) => {
      tracked.push({ phase, details });
      return task();
    });

    // Past the 15s applyEconomyAccrual rate limit from construction time (1_000ms).
    await advanceAndTick(60_000);

    const phases = tracked.map((entry) => entry.phase);
    expect(phases).toContain("apply_economy_accrual");
    const accrual = tracked.find((entry) => entry.phase === "apply_economy_accrual");
    expect(accrual?.details).toEqual({ playerId: "ai-1" });
  });

  it("still produces correct tile state when trackSyncMainThreadTask is not provided", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 10_000,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const state = runtime.exportState();
    expect(state.tiles.find((tile) => tile.x === 0 && tile.y === 0)?.ownerId).toBe("ai-1");
  });
});
