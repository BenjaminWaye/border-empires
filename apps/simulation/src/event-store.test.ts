import { describe, expect, it } from "vitest";

import { InMemorySimulationEventStore } from "./event-store.js";

describe("InMemorySimulationEventStore", () => {
  it("appends and loads stored events in order", async () => {
    const store = new InMemorySimulationEventStore();
    await store.appendEvent(
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
      1000
    );
    await store.appendEvent(
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "cmd-1",
        playerId: "player-1",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        attackerWon: true
      },
      2000
    );

    await expect(store.loadAllEvents()).resolves.toMatchObject([
      { eventId: 1, commandId: "cmd-1", eventType: "COMMAND_ACCEPTED", createdAt: 1000 },
      { eventId: 2, commandId: "cmd-1", eventType: "COMBAT_RESOLVED", createdAt: 2000 }
    ]);
    await expect(store.loadEventsAfter(1)).resolves.toMatchObject([
      { eventId: 2, commandId: "cmd-1", eventType: "COMBAT_RESOLVED", createdAt: 2000 }
    ]);
    await expect(store.loadEventsForCommand("cmd-1")).resolves.toHaveLength(2);
  });
});
