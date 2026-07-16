import { describe, expect, it } from "vitest";

import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { createSnapshotCheckpointManager } from "./snapshot-checkpoint-manager.js";

describe("createSnapshotCheckpointManager — isCheckpointInFlight", () => {
  it("is true only while a checkpoint's export+save is running", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    let exportInFlightValue: boolean | undefined;
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => {
        exportInFlightValue = manager.isCheckpointInFlight();
        return { initialState: { tiles: [], activeLocks: [] }, commandEvents: [] };
      },
      checkpointEveryEvents: 1
    });
    expect(manager.isCheckpointInFlight()).toBe(false);
    await eventStore.appendEvent(
      { eventType: "COMMAND_REJECTED", commandId: "cmd-1", playerId: "player-1", code: "BAD_COMMAND", message: "invalid" },
      1_000
    );
    await manager.onEventPersisted();
    expect(exportInFlightValue).toBe(true);
    expect(manager.isCheckpointInFlight()).toBe(false);
  });
});
