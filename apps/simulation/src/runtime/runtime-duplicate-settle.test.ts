import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

type SimulationRuntimeEventShape = SimulationEvent;

// CLAIM_CONTINUATION_SET's immediate-drive branch
// (runtime-claim-continuation-command-handlers.ts) can enqueue and dispatch
// its own SETTLE for an owned FRONTIER tile in the same tick the client's
// direct SETTLE (from "Build Relay Beacon" on that tile, see
// client-action-flow.ts's handleBuildAction) also arrives. Both requests
// want the same outcome, which is already in flight -- the second one must
// resolve as a no-op, not reject with SETTLE_INVALID "tile is already
// settling" (see runtime.ts's handleSettleCommand /
// runtime-settle-duplicate.ts).
describe("simulation runtime duplicate SETTLE handling", () => {
  it("resolves a duplicate SETTLE for the same player/tile as a no-op instead of rejecting", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          {
            x: 10,
            y: 9,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    runtime.submitCommand({
      commandId: "settle-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    runtime.submitCommand({
      commandId: "settle-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    expect(seen).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "settle-2" }));
    expect(seen).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "settle-2", playerId: "player-1" })
    );
    // Only the first SETTLE actually started a settlement process/charged gold.
    expect(scheduledTasks).toHaveLength(1);
  });
});
