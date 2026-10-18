import { describe, expect, it } from "vitest";

import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { createSnapshotCheckpointManager } from "./snapshot-checkpoint-manager.js";

const rejectedEvent = (commandId: string) =>
  ({ eventType: "COMMAND_REJECTED", commandId, playerId: "player-1", code: "BAD_COMMAND", message: "invalid" }) as const;

describe("createSnapshotCheckpointManager — checkpointOnShutdown", () => {
  it("waits out an in-flight checkpoint, then saves a fresh one covering the latest event", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    let releaseFirstExport: (() => void) | undefined;
    let exportCount = 0;
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: async () => {
        exportCount += 1;
        if (exportCount === 1) await new Promise<void>((resolve) => { releaseFirstExport = resolve; });
        return { initialState: { tiles: [], activeLocks: [] }, commandEvents: [] };
      },
      checkpointEveryEvents: 1
    });
    await eventStore.appendEvent(rejectedEvent("cmd-1"), 1_000);
    const periodic = manager.onEventPersisted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.isCheckpointInFlight()).toBe(true);
    // An event lands after the in-flight checkpoint already read its event id.
    await eventStore.appendEvent(rejectedEvent("cmd-2"), 1_001);

    const shutdown = manager.checkpointOnShutdown();
    releaseFirstExport?.();
    await periodic;

    await expect(shutdown).resolves.toBe("saved");
    expect(exportCount).toBe(2);
    expect((await snapshotStore.loadLatestSnapshot())?.lastAppliedEventId).toBe(await eventStore.loadLatestEventId());
  });

  it("ignores the memory watermark that defers periodic checkpoints", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => ({ initialState: { tiles: [], activeLocks: [] }, commandEvents: [] }),
      checkpointEveryEvents: 1,
      maxCheckpointRssBytes: 1,
      getMemoryUsage: () => ({ rssBytes: 10, heapUsedBytes: 10, heapTotalBytes: 10 })
    });
    await eventStore.appendEvent(rejectedEvent("cmd-1"), 1_000);
    await expect(manager.checkpointNow()).resolves.toBe("skipped_high_memory");
    await expect(manager.checkpointOnShutdown()).resolves.toBe("saved");
  });
});
