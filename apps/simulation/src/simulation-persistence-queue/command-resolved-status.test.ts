import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { createSimulationPersistenceQueue } from "./simulation-persistence-queue.js";

// Regression for 5000+ permanently-QUEUED SET_MUSTER commands found in
// production: instant commands (SET_MUSTER, CLEAR_MUSTER, the structure
// cancel/remove family) have no combat lock and only emitted TILE_DELTA_BATCH
// on success, which persistCommandStatus doesn't recognize — so their status
// never left QUEUED. COMMAND_RESOLVED closes that gap. Kept in its own file
// rather than added to simulation-persistence-queue.test.ts, which is
// already over the repo's file-line cap.
describe("createSimulationPersistenceQueue COMMAND_RESOLVED handling", () => {
  it("marks an instant command resolved when its COMMAND_RESOLVED event persists", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    await commandStore.persistQueuedCommand(
      {
        commandId: "set-muster-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 100,
        type: "SET_MUSTER",
        payloadJson: "{}"
      },
      100
    );

    queue.enqueueEvent({ eventType: "COMMAND_RESOLVED", commandId: "set-muster-1", playerId: "player-1" }, 110);
    await queue.whenIdle();

    await expect(commandStore.get("set-muster-1")).resolves.toMatchObject({ status: "RESOLVED", resolvedAt: 110 });
  });
});
