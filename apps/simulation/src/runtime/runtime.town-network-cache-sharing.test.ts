import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the shared town-network cache introduced to cut
// event_loop_blocked severity: buildConnectedTownNetworkForPlayer is
// O(settled_tiles + towns^2) and was being rebuilt TWICE per cache-miss
// cycle — once inside tileYieldEconomyContextForPlayer (consumed by
// consumeUpkeepFromTileYield), once inside buildPlayerUpdateEconomySnapshot
// (consumed by cachedEconomySnapshot via welcomeBackSummary/passive income).
// Pins that town_network_rebuild fires exactly once when both consumers are
// exercised back-to-back with no intervening tile mutation, and that both
// consumers still produce economically-correct results.
describe("simulation runtime — shared town network cache", () => {
  const buildRuntime = (
    trackSyncMainThreadTask: (
      phase: string,
      details: Record<string, string | number | boolean | null> | undefined,
      task: () => unknown
    ) => unknown
  ) => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
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
          // Fort generates gold upkeep (drives hasOutstandingUpkeepNeed).
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          // Resource tile is yield-bearing so consumeUpkeepFromTileYield's
          // loop actually iterates and lazily builds the tile-yield context.
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" as const }
        ],
        activeLocks: []
      },
      trackSyncMainThreadTask: (phase, details, task) => trackSyncMainThreadTask(phase, details, task) as ReturnType<typeof task>
    });
    return { runtime, setNow: (nextNowMs: number) => { now = nextNowMs; } };
  };

  it("builds the town network once and shares it between tileYieldEconomyContextForPlayer and cachedEconomySnapshot", async () => {
    const rebuildCount: Record<string, number> = {};
    const { runtime, setNow } = buildRuntime((phase, _details, task) => {
      rebuildCount[phase] = (rebuildCount[phase] ?? 0) + 1;
      return task();
    });

    // First applyPassiveIncome call only seeds lastIncomeTickAtMsByPlayer — no
    // cachedEconomySnapshot rebuild yet (same seed-on-first-call pattern as
    // applyEconomyAccrual).
    runtime.applyPassiveIncome(1_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBeUndefined();

    // Past the 15s applyEconomyAccrual rate limit — drives consumeUpkeepFromTileYield,
    // which lazily builds tileYieldEconomyContextForPlayer (and, via the shared
    // cache, the town network) for the first time.
    setNow(60_000);
    await runtime.tickTileShedding(60_000);
    expect(rebuildCount["tile_yield_economy_context_rebuild"]).toBe(1);
    expect(rebuildCount["town_network_rebuild"]).toBe(1);

    // No tile mutation happened above, so tileYieldContextCacheByPlayer and
    // townNetworkCacheByPlayer are both still warm. economySnapshotCacheByPlayer
    // was never populated, so this is a genuine cachedEconomySnapshot cache-miss
    // rebuild — it must reuse the already-warm town network instead of
    // rebuilding it a second time.
    runtime.applyPassiveIncome(60_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBe(1);
    expect(rebuildCount["town_network_rebuild"]).toBe(1);
  });

  it("still produces correct upkeep drain and income when trackSyncMainThreadTask is not provided", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
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
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" as const }
        ],
        activeLocks: []
      }
    });

    runtime.applyPassiveIncome(1_000, 999_999_999);
    now = 60_000;
    await runtime.tickTileShedding(60_000);
    runtime.applyPassiveIncome(60_000, 999_999_999);

    const state = runtime.exportState();
    // Upkeep drained gold below the starting 10_000 (fort upkeep, no income offset).
    const player = state.players.find((p) => p.id === "player-1");
    expect(player?.points).toBeLessThan(10_000);
  });
});
