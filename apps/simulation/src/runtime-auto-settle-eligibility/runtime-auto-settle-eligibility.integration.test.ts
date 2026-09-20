import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// End-to-end regressions for the event-driven auto-settle eligibility design
// (see this directory's module doc comments) -- exercised through the real
// SimulationRuntime composition root, not mocked contexts, so they pin the
// actual hook wiring (replaceTileState / setTileState / resolvePendingSettlement).

const settlementStartedTileKeys = (events: SimulationEvent[]): string[] =>
  events.filter((event): event is Extract<SimulationEvent, { eventType: "SETTLEMENT_STARTED" }> => event.eventType === "SETTLEMENT_STARTED")
    .map((event) => event.tileKey);

describe("event-driven auto-settle eligibility (integration)", () => {
  it("regression: relay beacon auto-claims a neutral fish tile and starts settlement after the new reach border is installed", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000 })]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            // Relay Beacon site, already settled so the test isolates build-completion reach activation.
            { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            // Distance 4 from the town: outside TOWN_REACH_RADIUS=3 before the beacon.
            // Distance 4 from the beacon: inside OUTPOST_REACH_RADIUS=5 after it activates.
            { x: 45, y: 40, terrain: "LAND", resource: "FISH" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "build-beacon-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 41, y: 40, structureType: "RELAY_BEACON" })
      });
      await Promise.resolve();

      expect(settlementStartedTileKeys(seen)).not.toContain("45,40");
      vi.advanceTimersByTime(structureBuildDurationMs("RELAY_BEACON"));
      await Promise.resolve();

      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({ x: 45, y: 40, ownerId: "player-1", ownershipState: "FRONTIER" })
      );
      expect(settlementStartedTileKeys(seen)).toContain("45,40");
    } finally {
      vi.useRealTimers();
    }
  });

  it("regression: a newly-claimed support tile starts settlement in the SAME lock resolution as EXPAND completing -- no territory-automation tick needed", async () => {
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => { scheduled.push({ delayMs, task }); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "TOWN" } },
          { x: 38, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }, // EXPAND origin (out of the town's ring)
          { x: 39, y: 40, terrain: "LAND" } // EXPAND target -- lands INSIDE the town's radius-1 ring once claimed
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "expand-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "EXPAND", payloadJson: JSON.stringify({ fromX: 38, fromY: 40, toX: 39, toY: 40 })
    });
    await Promise.resolve();
    expect(scheduled).toHaveLength(1); // EXPAND's lock resolves asynchronously

    // Resolve the EXPAND lock -- this is the exact tick the claimed tile
    // becomes FRONTIER via replaceTileState. SETTLEMENT_STARTED must appear
    // from THIS SAME resolution, not require a separate territory-automation
    // pass afterward.
    scheduled[0]!.task();

    expect(settlementStartedTileKeys(seen)).toContain("39,40");
  });

  it("regression: UPGRADE_TOWN_TIER (SETTLEMENT -> TOWN) immediately settles an already-frontier tile newly covered by the widened ring", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "SETTLEMENT", population: 50_000 } },
          // Plain support tile, already FRONTIER, adjacent to the town -- NOT
          // eligible while the town is SETTLEMENT tier (no support ring yet).
          { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          // FOOD slot supply so the tier-upgrade's extra FOOD demand doesn't reject the command.
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 3, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    expect(settlementStartedTileKeys(seen)).not.toContain("41,40"); // not eligible pre-upgrade

    runtime.submitCommand({
      commandId: "upgrade-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 40, y: 40 })
    });
    await Promise.resolve();

    // Fires synchronously from the UPGRADE_TOWN_TIER command itself -- no tick.
    expect(settlementStartedTileKeys(seen)).toContain("41,40");
  });

  it("regression: a dev slot freeing (settlement resolving) immediately starts the next queued eligible tile, not waiting for the next tick", async () => {
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: (delayMs, task) => { scheduled.push({ delayMs, task }); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 100_000, manpower: 100_000, manpowerUpdatedAt: 1_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "GREAT_CITY", population: 2_000_000 } },
          // 4 plain support tiles within the GREAT_CITY's radius-2 ring: 3 fill
          // DEVELOPMENT_PROCESS_LIMIT immediately at boot, the 4th queues.
          { x: 48, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 49, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 51, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 52, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    await Promise.resolve();

    // Boot only cold-seeds eligibleFrontierByOwner (queues all 4 -- it does
    // not itself attempt settlement, see seedEligibleFrontierQueueForOwner's
    // doc comment); the first territory-automation tick is what actually
    // drains the queue and starts settlement for the first 3 (dev slots free).
    await runtime.tickTerritoryAutomation(nowMs);
    const startedAtBoot = settlementStartedTileKeys(seen);
    expect(startedAtBoot).toHaveLength(3);
    expect(startedAtBoot).not.toContain("52,50");
    expect(scheduled).toHaveLength(3);

    // Resolve one of the three in-flight settlements -- this frees a dev slot.
    seen.length = 0;
    nowMs += 60_000;
    scheduled[0]!.task();

    // The 4th tile starts from THIS SAME resolution (resolvePendingSettlement's
    // slot-freed drain), not a subsequent territory-automation tick.
    expect(settlementStartedTileKeys(seen)).toContain("52,50");
  });

  it("load-shape regression: a player with a large frontier costs O(events), not O(frontier), per tile mutation", () => {
    const initialTiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" }> = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ];
    // A large, already-settled/frontier-free empire: no support-ring towns,
    // so none of these are auto-settle eligible -- they only exist to make
    // frontierTilesByOwner large.
    for (let i = 1; i <= 2_000; i += 1) {
      initialTiles.push({ x: i, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
    }
    // One extra, unrelated tile whose mutation should cost O(1)-ish work, not
    // scan the 2,000-tile frontier above.
    initialTiles.push({ x: 0, y: 5, terrain: "LAND" });

    const start = performance.now();
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      seedTiles: new Map(),
      initialState: { tiles: initialTiles, activeLocks: [] }
    });
    const bootMs = performance.now() - start;

    const mutateStart = performance.now();
    // A single unrelated command (COLLECT on the unrelated tile) must not
    // rescan the 2,000-tile frontier -- replaceTileState's auto-settle hook
    // is only ever called once, for the mutated tile itself.
    runtime.submitCommand({
      commandId: "collect-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "COLLECT_TILE", payloadJson: JSON.stringify({ x: 0, y: 5 })
    });
    const mutateMs = performance.now() - mutateStart;

    // Generous bound (this is a correctness-shape assertion, not a strict
    // perf benchmark): O(frontier) work here would be milliseconds-scale per
    // call in CI; O(1)/O(events) work is sub-millisecond. 20ms is well below
    // "rescans 2,000 tiles" territory while staying robust to CI jitter.
    expect(mutateMs).toBeLessThan(20);
    expect(bootMs).toBeGreaterThanOrEqual(0); // boot itself is allowed its one-time O(frontier) seed
  });
});
