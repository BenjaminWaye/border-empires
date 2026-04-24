import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationEventStore } from "./event-store.js";
import { InMemorySimulationSnapshotStore } from "./snapshot-store.js";
import { createSnapshotCheckpointManager } from "./snapshot-checkpoint-manager.js";

describe("createSnapshotCheckpointManager", () => {
  it("writes a snapshot after the configured number of persisted events", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => ({
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        },
        commandEvents: [
          {
            commandId: "cmd-1",
            events: [
              {
                eventType: "COMMAND_ACCEPTED",
                commandId: "cmd-1",
                playerId: "player-1",
                actionType: "ATTACK",
                originX: 10,
                originY: 10,
                targetX: 10,
                targetY: 11,
                resolvesAt: 1_150
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
            ]
          }
        ]
      }),
      checkpointEveryEvents: 2,
      now: () => 5_000
    });
    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 1_150
      },
      1_100
    );
    await manager.onEventPersisted();

    await expect(snapshotStore.loadLatestSnapshot()).resolves.toBeUndefined();

    await eventStore.appendEvent(
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
      1_200
    );
    await manager.onEventPersisted();

    const latestSnapshot = await snapshotStore.loadLatestSnapshot();
    expect(latestSnapshot).toMatchObject({
      lastAppliedEventId: 2,
      createdAt: 5_000,
      snapshotPayload: {
        commandEvents: [{ commandId: "cmd-1" }]
      }
    });
    expect(latestSnapshot?.snapshotPayload.initialState.tiles).toEqual(
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

  it("does not overlap snapshot writes while one is in flight", async () => {
    const eventStore = new InMemorySimulationEventStore();
    let releaseSave: (() => void) | undefined;
    const saveCalls: number[] = [];
    const snapshotStore = {
      async saveSnapshot(): Promise<void> {
        saveCalls.push(Date.now());
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
      },
      async loadLatestSnapshot() {
        return undefined;
      }
    };
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => ({
        initialState: { tiles: [], activeLocks: [] },
        commandEvents: []
      }),
      checkpointEveryEvents: 1
    });

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid command payload"
      },
      1_000
    );
    const first = manager.onEventPersisted();
    const second = manager.onEventPersisted();
    for (let index = 0; index < 5 && saveCalls.length === 0; index += 1) {
      await Promise.resolve();
    }

    expect(saveCalls).toHaveLength(1);
    releaseSave?.();
    await first;
    await second;
  });

  it("defers checkpoint writes when memory watermarks are exceeded", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const phases: string[] = [];
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => ({
        initialState: { tiles: [], activeLocks: [] },
        commandEvents: []
      }),
      checkpointEveryEvents: 1,
      getMemoryUsage: () => ({
        rssBytes: 600,
        heapUsedBytes: 300,
        heapTotalBytes: 400
      }),
      maxCheckpointRssBytes: 500,
      onCheckpointPhase: ({ phase }) => {
        phases.push(phase);
      }
    });
    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 1_150
      },
      1_100
    );

    await manager.onEventPersisted();

    await expect(snapshotStore.loadLatestSnapshot()).resolves.toBeUndefined();
    expect(phases).toContain("skipped_high_memory");
  });

  it("supports forced checkpoint compaction even when pending events are below threshold", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore,
      exportSnapshotSections: () => ({
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        },
        commandEvents: []
      }),
      checkpointEveryEvents: 100,
      now: () => 9_000
    });

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 1_150
      },
      1_100
    );

    const result = await manager.checkpointNow();

    expect(result).toBe("saved");
    await expect(snapshotStore.loadLatestSnapshot()).resolves.toMatchObject({
      lastAppliedEventId: 1,
      createdAt: 9_000
    });
  });

  it("allows forced checkpoint compaction to bypass memory watermark when requested", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const saveSnapshot = vi.fn(async () => undefined);
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore: {
        saveSnapshot,
        loadLatestSnapshot: vi.fn(async () => undefined)
      } as unknown as InMemorySimulationSnapshotStore,
      exportSnapshotSections: () => ({
        initialState: { tiles: [], activeLocks: [] },
        commandEvents: []
      }),
      checkpointEveryEvents: 100,
      getMemoryUsage: () => ({
        rssBytes: 600,
        heapUsedBytes: 300,
        heapTotalBytes: 400
      }),
      maxCheckpointRssBytes: 500
    });

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        resolvesAt: 1_150
      },
      1_100
    );

    const defaultResult = await manager.checkpointNow();
    const bypassResult = await manager.checkpointNow({ ignoreMemoryGuard: true });

    expect(defaultResult).toBe("skipped_high_memory");
    expect(bypassResult).toBe("saved");
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it("backs off repeated checkpoint attempts while memory remains hot", async () => {
    const loadLatestEventId = vi.fn(async () => 1);
    const eventStore = {
      loadLatestEventId,
      appendEvent: vi.fn()
    };
    const snapshotStore = {
      saveSnapshot: vi.fn(async () => undefined),
      loadLatestSnapshot: vi.fn(async () => undefined)
    };
    const manager = createSnapshotCheckpointManager({
      eventStore: eventStore as unknown as InMemorySimulationEventStore,
      snapshotStore: snapshotStore as unknown as InMemorySimulationSnapshotStore,
      exportSnapshotSections: () => ({
        initialState: { tiles: [], activeLocks: [] },
        commandEvents: []
      }),
      checkpointEveryEvents: 2,
      getMemoryUsage: () => ({
        rssBytes: 600,
        heapUsedBytes: 300,
        heapTotalBytes: 400
      }),
      maxCheckpointRssBytes: 500
    });

    await manager.onEventPersisted();
    await manager.onEventPersisted();
    await manager.onEventPersisted();

    expect(loadLatestEventId).not.toHaveBeenCalled();

    await manager.onEventPersisted();

    expect(loadLatestEventId).not.toHaveBeenCalled();
  });

  it("backs off after snapshot save failure instead of retrying on every later event", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const saveSnapshot = vi.fn(async () => {
      throw new Error("snapshot timeout");
    });
    const snapshotStore = {
      saveSnapshot,
      loadLatestSnapshot: vi.fn(async () => undefined)
    };
    const manager = createSnapshotCheckpointManager({
      eventStore,
      snapshotStore: snapshotStore as unknown as InMemorySimulationSnapshotStore,
      exportSnapshotSections: () => ({
        initialState: { tiles: [], activeLocks: [] },
        commandEvents: []
      }),
      checkpointEveryEvents: 2
    });

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid"
      },
      1_000
    );
    await manager.onEventPersisted();
    await eventStore.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-2",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid"
      },
      1_001
    );
    await expect(manager.onEventPersisted()).rejects.toThrow("snapshot timeout");
    expect(saveSnapshot).toHaveBeenCalledTimes(1);

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-3",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid"
      },
      1_002
    );
    await manager.onEventPersisted();
    expect(saveSnapshot).toHaveBeenCalledTimes(1);

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-4",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid"
      },
      1_003
    );
    await expect(manager.onEventPersisted()).rejects.toThrow("snapshot timeout");
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
  });
});
