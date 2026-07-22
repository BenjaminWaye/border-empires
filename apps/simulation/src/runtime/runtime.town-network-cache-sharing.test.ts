import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";

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

  // Regression for a gap the SETTLEMENT-exclusion change (economy-network.ts)
  // exposed: UPGRADE_TOWN_TIER only ever invalidated tileYieldContextCacheByPlayer,
  // never townNetworkCacheByPlayer. That was harmless while tier didn't affect
  // graph membership, but now a SETTLEMENT->TOWN upgrade changes whether the tile
  // counts as a connectivity node at all — a stale cached network would keep
  // treating it as excluded until an unrelated tile-ownership event happened to
  // invalidate the cache.
  it("rebuilds the town network after UPGRADE_TOWN_TIER moves a town across the SETTLEMENT boundary", async () => {
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
            allies: new Set<string>(),
            strategicResources: { FOOD: 1_000_000, WOOD: 0, STONE: 0, IRON: 0, CRYSTAL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // Directly 8-adjacent so they're connected the moment both are
          // TOWN-tier-or-higher, with no corridor tiles needed.
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Alpha", type: "FARMING", populationTier: "TOWN", population: 10 }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Beta", type: "FARMING", populationTier: "SETTLEMENT", population: 10 } }
        ],
        activeLocks: []
      }
    });

    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    // Warm tileYieldContextCacheByPlayer / townNetworkCacheByPlayer while
    // Beta is still a SETTLEMENT — with only Alpha counting, this hits the
    // ownedTownKeys.size<=1 short-circuit and caches a network with no Beta
    // entry at all. Mirrors the seed-on-first-call / rate-limit pattern from
    // the test above: applyPassiveIncome seeds, then a later tick past the
    // rate limit actually drives consumeUpkeepFromTileYield's cache-miss build.
    runtime.applyPassiveIncome(1_000, 999_999_999);
    now = 60_000;
    await runtime.tickTileShedding(60_000);

    runtime.submitCommand({
      commandId: "upgrade-beta-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "UPGRADE_TOWN_TIER",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });
    await Promise.resolve();

    const resolved = seen.find((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "upgrade-beta-1");
    expect(resolved).toBeDefined();

    // The command's own TILE_DELTA_BATCH for Beta must reflect the rebuilt
    // network (connected to Alpha) — not a stale cached network from when
    // Beta was still a SETTLEMENT and excluded from the graph entirely.
    const batch = seen.find(
      (e): e is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        e.eventType === "TILE_DELTA_BATCH" && e.commandId === "upgrade-beta-1"
    );
    const betaDelta = batch?.tileDeltas.find((d) => d.x === 1 && d.y === 0);
    const betaTown = betaDelta?.townJson ? JSON.parse(betaDelta.townJson) : undefined;
    expect(betaTown?.populationTier).toBe("TOWN");
    expect(betaTown?.connectedTownCount).toBe(1);
    expect(betaTown?.connectedTownNames).toEqual(["Alpha"]);
  });

  // Regression for the second tile-write path: the progression handlers use
  // setTileState, which deliberately skips refreshEconomyCachesForTileChange.
  // That bypassed corridor union-find maintenance, so upgrading a SETTLEMENT
  // (a pass-through corridor tile) into a real TOWN (a connectivity BARRIER)
  // left the two sides merged — reporting Alpha as connected to Beta straight
  // through the new barrier, and inflating its connectedTownBonus.
  it("treats a settlement upgraded to a real town as a connectivity barrier", async () => {
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
            allies: new Set<string>(),
            strategicResources: { FOOD: 1_000_000, WOOD: 0, STONE: 0, IRON: 0, CRYSTAL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // Alpha — land — Mid(settlement) — land — Beta. While Mid is a
          // settlement every tile between Alpha and Beta is corridor, so the
          // two are connected through it.
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Alpha", type: "FARMING", populationTier: "TOWN", population: 100_000 }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Mid", type: "FARMING", populationTier: "SETTLEMENT", population: 10 } },
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Beta", type: "FARMING", populationTier: "TOWN", population: 10 } }
        ],
        activeLocks: []
      }
    });

    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    // Warm the caches while Mid is still a corridor settlement.
    runtime.applyPassiveIncome(1_000, 999_999_999);
    now = 60_000;
    await runtime.tickTileShedding(60_000);

    runtime.submitCommand({
      commandId: "upgrade-mid", sessionId: "session-1", playerId: "player-1", clientSeq: 1,
      issuedAt: 60_000, type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 2, y: 0 })
    });
    await Promise.resolve();

    // Upgrade Alpha too, purely to get a fresh tile delta carrying Alpha's
    // recomputed connectivity (TOWN -> CITY keeps it a town node).
    runtime.submitCommand({
      commandId: "upgrade-alpha", sessionId: "session-1", playerId: "player-1", clientSeq: 2,
      issuedAt: 60_000, type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();

    const batch = seen.find(
      (e): e is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        e.eventType === "TILE_DELTA_BATCH" && e.commandId === "upgrade-alpha"
    );
    const alphaDelta = batch?.tileDeltas.find((d) => d.x === 0 && d.y === 0);
    const alphaTown = alphaDelta?.townJson ? JSON.parse(alphaDelta.townJson) : undefined;

    expect(alphaTown?.populationTier).toBe("CITY");
    // Mid is now a barrier: Alpha reaches Mid, but NOT Beta behind it.
    expect(alphaTown?.connectedTownCount).toBe(1);
    expect(alphaTown?.connectedTownNames).toEqual(["Mid"]);
  });
});
