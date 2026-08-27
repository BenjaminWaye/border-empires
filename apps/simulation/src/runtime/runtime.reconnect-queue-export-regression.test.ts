import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { yieldToEventLoop } from "../event-loop-yield.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression: exportVisibleStateForPlayer(Async) is the export path that
// actually feeds an ordinary reconnect/login snapshot (SubscribePlayer ->
// buildPlayerSubscriptionSnapshot in player-snapshot.ts) -- distinct from the
// full exportState() used for checkpointing/persistence. The reconnect path
// never included devQueue/waypointQueue at all, so a queued waypoint or
// dev-queue entry survived fine mid-session (nothing here runs then) but was
// silently absent from every reconnect's INIT payload -- restore always saw
// "the server has nothing" and, once local memory/sessionStorage was also
// gone (e.g. a real tab close), the entry was unrecoverable even though the
// live in-memory queue still held it the whole time.
// A town anchors reach for the four surrounding frontier tiles (matching the
// pattern runtime.dev-queue.test.ts uses). Three of those frontier tiles are
// settled directly (occupying all DEVELOPMENT_PROCESS_LIMIT = 3 slots) so a
// fourth SETTLE enqueued through the dev queue has no slot available and
// tryDrainDevQueue's `if (!hasAvailableDevelopmentSlot) return;` leaves it
// queued untouched -- avoiding the auto-drain either starting it (which
// would move it out of devQueue for an unrelated reason) or rejecting it
// outright (which the auto-drain still drops on any rejection, unlike the
// waypoint queue's post-#1612 defer behavior).
const homeAndFrontierTiles = (playerId: string) => [
  { x: 10, y: 10, terrain: "LAND" as const, ownerId: playerId, ownershipState: "SETTLED" as const, town: { name: "Home", type: "FARMING" as const, populationTier: "SETTLEMENT" as const } },
  { x: 11, y: 10, terrain: "LAND" as const, ownerId: playerId, ownershipState: "FRONTIER" as const },
  { x: 9, y: 10, terrain: "LAND" as const, ownerId: playerId, ownershipState: "FRONTIER" as const },
  { x: 10, y: 11, terrain: "LAND" as const, ownerId: playerId, ownershipState: "FRONTIER" as const },
  { x: 10, y: 9, terrain: "LAND" as const, ownerId: playerId, ownershipState: "FRONTIER" as const }
];

describe("reconnect/login snapshot includes durable queues", () => {
  it("includes waypointQueue and devQueue in exportVisibleStateForPlayer once queued", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
      initialState: {
        tiles: [...homeAndFrontierTiles("player-1"), { x: 50, y: 50, terrain: "LAND" }],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "waypoint-enqueue-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WAYPOINT_ENQUEUE",
      payloadJson: JSON.stringify({ x: 50, y: 50 }) // far from any owned tile -- NOT_ADJACENT, retryable, stays queued
    });
    for (const [x, y] of [[11, 10], [9, 10], [10, 11]]) {
      runtime.submitCommand({
        commandId: `settle-${x}-${y}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 100 + x,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y })
      });
    }
    runtime.submitCommand({
      commandId: "dev-queue-enqueue-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "DEV_QUEUE_ENQUEUE",
      payloadJson: JSON.stringify({ x: 10, y: 9, tileKey: "10,9", kind: "SETTLE" })
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const player = exported.players.find((p) => p.id === "player-1");

    expect(player?.waypointQueue).toEqual([{ x: 50, y: 50, queuedAt: 1_000 }]);
    expect(player?.devQueue).toEqual([
      expect.objectContaining({ tileKey: "10,9", x: 10, y: 9, kind: "SETTLE" })
    ]);
  });

  it("keeps exportVisibleStateForPlayerAsync in parity with the sync variant for these fields", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }, { x: 30, y: 30, terrain: "LAND" }],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "waypoint-enqueue-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WAYPOINT_ENQUEUE",
      payloadJson: JSON.stringify({ x: 30, y: 30 }) // not adjacent to (10,10) -- retryable, stays queued
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    const syncOut = runtime.exportVisibleStateForPlayer("player-1");
    const asyncOut = await runtime.exportVisibleStateForPlayerAsync("player-1", yieldToEventLoop);

    expect(JSON.stringify(asyncOut)).toEqual(JSON.stringify(syncOut));
    expect(asyncOut.players.find((p) => p.id === "player-1")?.waypointQueue).toEqual([
      { x: 30, y: 30, queuedAt: 1_000 }
    ]);
  });
});
