import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the 2026-09-17 prod CPU-throttle incident. A live CPU
// profile of the sim thread put ~40% of all non-idle time in
// tickTerritoryAutomation -> autoSettlementQueueForPlayer -> rebuild ->
// hasTownSupport -> wideSupportRingScanRadiusFor, driven by ONE human player
// with ~10.5k frontier tiles whose O(frontier) queue was rebuilt from
// scratch on every state update -- the previous cache was AI-only. This pins
// that a human player's queue rebuild ("auto_settlement_queue_rebuild") does
// not scale with the number of territory-automation ticks / state updates,
// only with real tile changes (and the 60s max-age bound).
describe("simulation runtime — auto-settlement queue cache covers human players", () => {
  const buildRuntime = () => {
    let now = 1_000;
    const rebuildCount: Record<string, number> = {};
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        [
          "human-1",
          {
            id: "human-1",
            isAi: false,
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
          { x: 0, y: 0, terrain: "LAND", ownerId: "human-1", ownershipState: "SETTLED", town: { ownerId: "human-1", name: "T", populationTier: "TOWN" as const, population: 10 } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "human-1", ownershipState: "FRONTIER" },
          { x: 2, y: 0, terrain: "LAND", ownerId: "human-1", ownershipState: "FRONTIER" },
          { x: 0, y: 1, terrain: "LAND", ownerId: "human-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      },
      trackSyncMainThreadTask: (phase, _details, task) => {
        rebuildCount[phase] = (rebuildCount[phase] ?? 0) + 1;
        return task();
      }
    });
    return { runtime, rebuildCount, setNow: (nextNowMs: number) => { now = nextNowMs; } };
  };

  it("rebuilds once per dirty window, not once per territory-automation tick", async () => {
    const { runtime, rebuildCount, setNow } = buildRuntime();
    // Several ticks inside one minute with no intervening tile mutation from
    // outside: before the fix every tick paid 2-3 fresh O(frontier) rebuilds
    // for a human player.
    await runtime.tickTerritoryAutomation(1_000);
    const afterFirst = rebuildCount["auto_settlement_queue_rebuild"] ?? 0;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    for (let i = 1; i <= 5; i += 1) {
      setNow(1_000 + i * 2_000); // 5 ticks over 10s -- inside the 60s max age
      await runtime.tickTerritoryAutomation(1_000 + i * 2_000);
    }
    // Auto-settle itself mutates tiles (marks the player dirty), so allow the
    // coalesced follow-up rebuilds -- but nowhere near one per read.
    const afterSix = rebuildCount["auto_settlement_queue_rebuild"] ?? 0;
    expect(afterSix - afterFirst).toBeLessThanOrEqual(2);
  });

  it("rebuilds again once the entry exceeds the max age", async () => {
    const { runtime, rebuildCount, setNow } = buildRuntime();
    await runtime.tickTerritoryAutomation(1_000);
    const before = rebuildCount["auto_settlement_queue_rebuild"] ?? 0;
    setNow(200_000);
    await runtime.tickTerritoryAutomation(200_000);
    expect(rebuildCount["auto_settlement_queue_rebuild"] ?? 0).toBeGreaterThan(before);
  });
});
