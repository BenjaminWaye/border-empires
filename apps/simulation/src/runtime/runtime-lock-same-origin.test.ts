import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// A lock is indexed under both its origin and its target tile. Two attacks
// launched from the same origin used to collide on that origin slot, so the
// first lock was dropped as "stale" at resolution and never resolved.
const buildRuntime = () =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
      ["player-2", buildPlayer("player-2", { manpower: 1_000 })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

const attack = (commandId: string, clientSeq: number, toX: number, toY: number) => ({
  commandId,
  sessionId: "session-1",
  playerId: "player-1",
  clientSeq,
  issuedAt: 1_000,
  type: "ATTACK" as const,
  payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX, toY })
});

describe("two attacks launched from one origin tile", () => {
  it("resolves both of them", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildRuntime();
      const seen = collectEvents(runtime);
      runtime.submitCommand(attack("attack-a", 1, 10, 11));
      runtime.submitCommand(attack("attack-b", 2, 11, 10));
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED")).toEqual([]);
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      const resolved = seen
        .filter((event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED")
        .map((event) => event.commandId)
        .sort();
      expect(resolved).toEqual(["attack-a", "attack-b"]);
      expect(runtime.exportState().activeLocks).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
