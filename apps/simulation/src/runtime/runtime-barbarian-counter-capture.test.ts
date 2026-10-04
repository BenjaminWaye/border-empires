import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents, testRuntimePlayer } from "./runtime.test-helpers.js";

type SimulationRuntimeEventShape = SimulationEvent;

// Extracted from runtime.test.ts ("barbarian walk vs multiply") so that file
// does not grow past its line cap.
describe("barbarian counter-captures", () => {
  it("keeps barbarian counter-captures settled when a player attack fails", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledTasks.push({ delayMs, task });
        },
        initialPlayers: new Map([
          ["player-1", testRuntimePlayer("player-1")],
          [
            "barbarian-1",
            buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })
          ]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
            // A second, distant tile keeps player-1 from being eliminated when the barbarian takes (10,10):
            // an elimination respawn right beside the barbarian would (by design) clear it, which is not
            // what this test is about.
            { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "failed-attack-barb-counter",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      expect(scheduledTasks).toHaveLength(1);
      scheduledTasks[0]?.task();

      const origin = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(origin).toEqual(
        expect.objectContaining({
          ownerId: "barbarian-1",
          ownershipState: "SETTLED"
        })
      );
      expect(origin?.frontierDecayAt).toBeUndefined();
      expect(origin?.frontierDecayKind).toBeUndefined();

      const resolved = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> =>
          event.eventType === "COMBAT_RESOLVED" && event.commandId === "failed-attack-barb-counter"
      );
      expect(resolved?.combatResult?.changes).toContainEqual(
        expect.objectContaining({
          x: 10,
          y: 10,
          ownerId: "barbarian-1",
          ownershipState: "SETTLED"
        })
      );
    } finally {
      randomSpy.mockRestore();
    }
  });
});
