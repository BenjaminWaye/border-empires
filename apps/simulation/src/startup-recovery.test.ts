import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "./command-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";
import { SimulationRuntime } from "./runtime.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "./snapshot-store.js";
import { loadSimulationStartupRecovery } from "./startup-recovery.js";

describe("loadSimulationStartupRecovery", () => {
  it("rebuilds runtime startup inputs from durable command and event stores", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();

    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-resolved",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      },
      1_000
    );
    await commandStore.markAccepted("cmd-resolved", 1_100);
    await commandStore.markResolved("cmd-resolved", 1_200);
    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-resolved",
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
    await eventStore.appendEvent(
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "cmd-resolved",
        playerId: "player-1",
        originX: 10,
        originY: 10,
        targetX: 10,
        targetY: 11,
        attackerWon: true
      },
      1_200
    );

    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-queued",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_300,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 10, toY: 12 })
      },
      1_300
    );

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore
    });

    expect(startupRecovery.recoveredCommandCount).toBe(1);
    expect(startupRecovery.recoveredEventCount).toBe(2);
    expect(startupRecovery.initialState.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 10,
          y: 11,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );

    const scheduledSoonTasks: Array<() => void> = [];
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_300,
      scheduleSoon: (task) => {
        scheduledSoonTasks.push(task);
      },
      scheduleAfter: (_delayMs, task) => {
        scheduledTasks.push(task);
      },
      initialState: startupRecovery.initialState,
      initialCommandHistory: startupRecovery.initialCommandHistory
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "cmd-resolved",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_400,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    while (scheduledSoonTasks.length > 0) {
      scheduledSoonTasks.shift()?.();
    }
    expect(seen.slice(0, 3)).toEqual([
      "COMMAND_ACCEPTED:cmd-resolved",
      "COMBAT_RESOLVED:cmd-resolved",
      "COMMAND_ACCEPTED:cmd-queued"
    ]);

    expect(scheduledTasks).toHaveLength(1);
    scheduledTasks[0]?.();
    expect(seen[3]).toBe("COMBAT_RESOLVED:cmd-queued");
  });

  it("rebuilds startup inputs from the latest snapshot plus later events", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      },
      1_000
    );
    await commandStore.markAccepted("cmd-1", 1_100);
    await commandStore.markResolved("cmd-1", 1_200);
    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_300,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 10, toY: 12 })
      },
      1_300
    );
    await commandStore.markAccepted("cmd-2", 1_350);
    await commandStore.markResolved("cmd-2", 1_450);

    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [
            { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 12, ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        },
        commands: await commandStore.loadAllCommands(),
        eventsByCommandId: new Map([
          [
            "cmd-1",
            [
              {
                eventType: "COMMAND_ACCEPTED" as const,
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
                eventType: "COMBAT_RESOLVED" as const,
                commandId: "cmd-1",
                playerId: "player-1",
                originX: 10,
                originY: 10,
                targetX: 10,
                targetY: 11,
                attackerWon: true
              }
            ]
          ]
        ])
      }),
      createdAt: 2_000
    });

    await eventStore.appendEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-2",
        playerId: "player-1",
        actionType: "ATTACK",
        originX: 10,
        originY: 11,
        targetX: 10,
        targetY: 12,
        resolvesAt: 1_400
      },
      2_100
    );
    await eventStore.appendEvent(
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "cmd-2",
        playerId: "player-1",
        originX: 10,
        originY: 11,
        targetX: 10,
        targetY: 12,
        attackerWon: true
      },
      2_200
    );

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore,
      snapshotStore
    });

    expect(startupRecovery.recoveredCommandCount).toBe(0);
    expect(startupRecovery.recoveredEventCount).toBe(2);
    expect(startupRecovery.initialState.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 10,
          y: 12,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );
    expect(startupRecovery.initialCommandHistory.eventsByCommandId.get("cmd-1")).toBeUndefined();
    expect(startupRecovery.initialCommandHistory.eventsByCommandId.get("cmd-2")).toHaveLength(2);
  });

  it("ignores an empty snapshot and falls back to seed-plus-events recovery", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [],
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore,
      snapshotStore,
      seedProfile: "stress-10ai"
    });

    expect(startupRecovery.initialState.tiles.length).toBeGreaterThan(0);
    expect(startupRecovery.initialState.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 4,
          y: 0,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );
  });

  it("fails closed when durable startup state is required and stores are empty", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    await expect(
      loadSimulationStartupRecovery({
        commandStore,
        eventStore,
        snapshotStore,
        seedProfile: "season-20ai",
        requireDurableState: true
      })
    ).rejects.toThrow(
      "simulation startup recovery requires durable state but no snapshot, events, or bootstrap state were found"
    );
  });

  it("loads snapshot follow-up events in batches instead of one giant query", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 1,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const firstBatch = Array.from({ length: 5_000 }, (_, index) => ({
      eventId: index + 2,
      commandId: `cmd-${index}`,
      playerId: "player-1",
      eventType: "COMMAND_ACCEPTED" as const,
      eventPayload: {
        eventType: "COMMAND_ACCEPTED" as const,
        commandId: `cmd-${index}`,
        playerId: "player-1",
        actionType: "EXPAND" as const,
        originX: 10,
        originY: 10,
        targetX: 11,
        targetY: 10,
        resolvesAt: 1_100
      },
      createdAt: 1_100
    }));
    const secondBatch = [
      {
        eventId: 5_002,
        commandId: "cmd-1",
        playerId: "player-1",
        eventType: "COMBAT_RESOLVED" as const,
        eventPayload: {
          eventType: "COMBAT_RESOLVED" as const,
          commandId: "cmd-1",
          playerId: "player-1",
          originX: 10,
          originY: 10,
          targetX: 11,
          targetY: 10,
          attackerWon: true
        },
        createdAt: 1_200
      }
    ];
    const loadEventsAfterSpy = vi.fn(async (eventId: number) => {
      if (eventId === 1) return firstBatch;
      if (eventId === 5_001) return secondBatch;
      return [];
    });
    const eventStore = {
      appendEvent: vi.fn(),
      loadAllEvents: vi.fn(async () => []),
      loadEventsAfter: loadEventsAfterSpy,
      loadEventsForCommand: vi.fn(async () => []),
      loadLatestEventId: vi.fn(async () => 3)
    };

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore,
      snapshotStore
    });

    expect(startupRecovery.recoveredEventCount).toBe(5_001);
    expect(loadEventsAfterSpy).toHaveBeenCalledTimes(2);
    expect(loadEventsAfterSpy).toHaveBeenNthCalledWith(1, 1, 5_000);
    expect(loadEventsAfterSpy).toHaveBeenNthCalledWith(2, 5_001, 5_000);
  });

  it("streams startup events in batches even without a snapshot", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const loadEventsAfterSpy = vi.fn(async (eventId: number) => {
      if (eventId === 0) {
        return [
          {
            eventId: 1,
            commandId: "cmd-1",
            playerId: "player-1",
            eventType: "COMMAND_ACCEPTED" as const,
            eventPayload: {
              eventType: "COMMAND_ACCEPTED" as const,
              commandId: "cmd-1",
              playerId: "player-1",
              actionType: "ATTACK" as const,
              originX: 10,
              originY: 10,
              targetX: 10,
              targetY: 11,
              resolvesAt: 1_100
            },
            createdAt: 1_000
          },
          {
            eventId: 2,
            commandId: "cmd-1",
            playerId: "player-1",
            eventType: "COMBAT_RESOLVED" as const,
            eventPayload: {
              eventType: "COMBAT_RESOLVED" as const,
              commandId: "cmd-1",
              playerId: "player-1",
              originX: 10,
              originY: 10,
              targetX: 10,
              targetY: 11,
              attackerWon: true
            },
            createdAt: 1_050
          }
        ];
      }
      return [];
    });
    const loadAllEventsSpy = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const eventStore = {
      appendEvent: vi.fn(),
      loadAllEvents: loadAllEventsSpy,
      loadEventsAfter: loadEventsAfterSpy,
      loadEventsForCommand: vi.fn(async () => []),
      loadLatestEventId: vi.fn(async () => 2)
    };

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore
    });

    expect(startupRecovery.recoveredEventCount).toBe(2);
    expect(loadAllEventsSpy).not.toHaveBeenCalled();
    expect(loadEventsAfterSpy).toHaveBeenCalledTimes(1);
    expect(loadEventsAfterSpy).toHaveBeenNthCalledWith(1, 0, 5_000);
  });
});
