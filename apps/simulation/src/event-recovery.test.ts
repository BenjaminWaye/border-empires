import { describe, expect, it } from "vitest";

import { recoverSimulationStateFromEvents } from "./event-recovery.js";

describe("recoverSimulationStateFromEvents", () => {
  it("rebuilds tile ownership and clears completed locks from event history", () => {
    const recovered = recoverSimulationStateFromEvents([
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 2000
      },
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "cmd-1",
        playerId: "player-1",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        attackerWon: true
      }
    ]);

    expect(recovered.activeLocks).toEqual([]);
    expect(recovered.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 10,
          y: 11,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );
  });

  it("keeps unresolved accepted locks in recovered state", () => {
    const recovered = recoverSimulationStateFromEvents([
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-2",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 3000
      }
    ]);

    expect(recovered.activeLocks).toEqual([
      {
        commandId: "cmd-2",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        originKey: "10,10",
        targetKey: "10,11",
        resolvesAt: 3000
      }
    ]);
  });
});
