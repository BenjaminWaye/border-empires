import { describe, expect, it } from "vitest";
import { FRONTIER_CLAIM_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * End-to-end coverage for out-of-reach auto-settle, through the real
 * command/lock/scheduled-timer pipeline rather than a hand-built resolveLock
 * context (see runtime-lock-resolution.out-of-reach-auto-settle.test.ts for
 * the branch-level unit coverage). This also locks in the companion change:
 * a dock only projects reach once SETTLED, so the auto-settle path is what
 * actually lets a far-off dock become useful instead of just decaying.
 */

const runScheduled = async (scheduledTasks: Array<() => void>): Promise<void> => {
  await Promise.resolve();
  while (scheduledTasks.length > 0) scheduledTasks.shift()?.();
  await Promise.resolve();
};

describe("out-of-reach auto-settle — full runtime integration", () => {
  it("auto-settles a claimed dock far outside reach, which then projects its own reach", async () => {
    const scheduledTasks: Array<() => void> = [];
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" }
          // No reach anchor anywhere near (50,50) -- the linked dock is the
          // only thing that could ever cover it, and it starts FRONTIER.
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "cmd-dock-expand",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
    nowMs += FRONTIER_CLAIM_MS;
    await runScheduled(scheduledTasks); // resolves the claim lock, then chains straight into the auto-started settlement (the mocked scheduleAfter ignores delay)

    // Auto-settle took the branch instead of stamping a decay timer at any point.
    expect(seen.some((event) => event.eventType === "SETTLEMENT_STARTED")).toBe(true);
    expect(
      seen.some((event) => event.eventType === "TILE_DELTA_BATCH" && event.tileDeltas.some((d) => d.frontierDecayKind === "OUT_OF_REACH"))
    ).toBe(false);

    const settled = runtime.wireDeltaForTileKey("50,50", "player-1");
    expect(settled?.ownershipState).toBe("SETTLED");
    expect(settled?.dockId).toBe("dock-b");

    // The dock is now SETTLED, so it should project reach over its own tile
    // -- confirming the companion "docks only anchor once settled" change is
    // what makes this auto-settle path meaningful.
    expect(runtime.reachTileKeysForPlayer("player-1")).toContain("50,50");
  });

  it("clears a neighboring tile's out-of-reach decay once a nearby dock settles and its reach catches up to it", async () => {
    const scheduledTasks: Array<() => void> = [];
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
          // Already owned and decaying out of reach, at the edge of what the
          // dock's DOCK_REACH_RADIUS=1 disk will cover once it settles.
          { x: 51, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM", frontierDecayAt: 9_999_999, frontierDecayKind: "OUT_OF_REACH" }
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });

    expect(runtime.wireDeltaForTileKey("51,50", "player-1")?.frontierDecayKind).toBe("OUT_OF_REACH");

    runtime.submitCommand({
      commandId: "cmd-dock-expand-rescue",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
    nowMs += FRONTIER_CLAIM_MS;
    await runScheduled(scheduledTasks); // claim resolves, dock auto-settles, its anchor activates and its disk covers (51,50)

    expect(runtime.wireDeltaForTileKey("50,50", "player-1")?.ownershipState).toBe("SETTLED");
    // The neighboring tile's decay timer is gone -- reach caught up to it.
    expect(runtime.wireDeltaForTileKey("51,50", "player-1")?.frontierDecayKind).toBeUndefined();
    expect(runtime.wireDeltaForTileKey("51,50", "player-1")?.ownerId).toBe("player-1"); // and it's still held, not expired
  });

  it("decays a claimed dock that's out of reach if the player can't afford to auto-settle", async () => {
    const scheduledTasks: Array<() => void> = [];
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      // Enough manpower to EXPAND (costs EXPAND_MANPOWER_COST=10) but not enough left to auto-settle (needs SETTLE_MANPOWER_COST=20).
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 15 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" }
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });
    collectEvents(runtime);

    runtime.submitCommand({
      commandId: "cmd-dock-expand-poor",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
    nowMs += FRONTIER_CLAIM_MS;
    await runScheduled(scheduledTasks);

    const claimed = runtime.wireDeltaForTileKey("50,50", "player-1");
    expect(claimed?.ownerId).toBe("player-1");
    expect(claimed?.ownershipState).toBe("FRONTIER");
    // Can't afford SETTLE_MANPOWER_COST -- falls back to the ordinary decay path.
    expect(claimed?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(typeof claimed?.frontierDecayAt).toBe("number");
  });

  it("lets a human SETTLE command claim a captured town frontier tile outside their reach", async () => {
    // Same exemption as the auto-settle path above, but through the human
    // SETTLE command handler directly -- a captured (e.g. via ATTACK, which
    // is not reach-gated) town/dock tile must not be OUT_OF_REACH-rejected,
    // since settling it is exactly what gives it its own reach.
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { name: "Captured", type: "FARMING", populationTier: "OUTPOST" } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "settle-out-of-reach-town",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 30 })
    });
    await runScheduled(scheduledTasks);

    expect(seen).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "settle-out-of-reach-town", code: "OUT_OF_REACH" }));
    expect(runtime.wireDeltaForTileKey("10,30", "player-1")?.ownershipState).toBe("SETTLED");
  });
});
