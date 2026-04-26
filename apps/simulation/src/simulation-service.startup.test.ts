import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "./command-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "./snapshot-store.js";
import { createSimulationService } from "./simulation-service.js";
import type { SimulationEventStore } from "./event-store.js";

describe("simulation service startup recovery", () => {
  it("falls back to the seed world when seed-profile recovery times out", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const eventStore: SimulationEventStore = {
      appendEvent: async () => undefined,
      loadAllEvents: async () => [],
      loadEventsAfter: () =>
        new Promise(() => {
          // Intentionally unresolved to simulate a dead startup recovery path.
        }),
      loadEventsForCommand: async () => [],
      loadLatestEventId: async () => 0
    };

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      commandStore,
      eventStore,
      snapshotStore,
      startupRecoveryTimeoutMs: 10,
      allowSeedRecoveryFallback: true,
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    expect(service.startupRecovery.recoveredCommandCount).toBe(0);
    expect(service.startupRecovery.recoveredEventCount).toBe(0);
    expect(service.startupRecovery.initialState.tiles.length).toBeGreaterThan(0);
    expect(
      service.startupRecovery.initialState.tiles.some(
        (tile) => tile.ownerId === "player-1" && typeof tile.ownershipState === "string"
      )
    ).toBe(true);
  });

  it("does not fall back to a seed world for db-backed startup recovery failure", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const eventStore: SimulationEventStore = {
      appendEvent: async () => undefined,
      loadAllEvents: async () => [],
      loadEventsAfter: () =>
        new Promise(() => {
          // Intentionally unresolved to simulate a dead startup recovery path.
        }),
      loadEventsForCommand: async () => [],
      loadLatestEventId: async () => 0
    };

    await expect(
      createSimulationService({
        seedProfile: "season-20ai",
        databaseUrl: "postgres://simulation",
        commandStore,
        eventStore,
        snapshotStore,
        startupRecoveryTimeoutMs: 10,
        allowSeedRecoveryFallback: true,
        log: {
          info: () => undefined,
          error: () => undefined
        }
      })
    ).rejects.toThrow("simulation startup recovery timed out");
  });

  it("does not auto-seed db-backed startup when durable stores are empty", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    await expect(
      createSimulationService({
        seedProfile: "season-20ai",
        databaseUrl: "postgres://simulation",
        commandStore,
        eventStore,
        snapshotStore,
        log: {
          info: () => undefined,
          error: () => undefined
        }
      })
    ).rejects.toThrow(
      "simulation startup recovery requires durable state but no snapshot, events, or bootstrap state were found"
    );
  });

  it("backfills seed tiles for sparse db-backed snapshots while preserving recovered ownership", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [{ x: 99, y: 99, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      databaseUrl: "postgres://simulation",
      commandStore,
      eventStore,
      snapshotStore,
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    const tiles = service.runtime.exportState().tiles;
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ x: 99, y: 99, ownerId: "player-1" })])
    );
    await service.close();
  });

  it("runs startup replay compaction after the service starts listening", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore: SimulationEventStore = {
      appendEvent: async () => undefined,
      loadAllEvents: async () => [],
      loadEventsAfter: async (eventId) => {
        if (eventId > 0) return [];
        return [
          {
            eventId: 1,
            commandId: "cmd-1",
            playerId: "player-1",
            eventType: "COMMAND_REJECTED",
            eventPayload: {
              eventType: "COMMAND_REJECTED",
              commandId: "cmd-1",
              playerId: "player-1",
              code: "NOT_ADJACENT",
              message: "not adjacent"
            },
            createdAt: 1_000
          },
          {
            eventId: 2,
            commandId: "cmd-2",
            playerId: "player-1",
            eventType: "COMMAND_REJECTED",
            eventPayload: {
              eventType: "COMMAND_REJECTED",
              commandId: "cmd-2",
              playerId: "player-1",
              code: "NOT_ADJACENT",
              message: "not adjacent"
            },
            createdAt: 1_001
          }
        ];
      },
      loadEventsForCommand: async () => [],
      loadLatestEventId: async () => 2
    };
    let releaseSaveSnapshot: (() => void) | undefined;
    const saveSnapshotStarted = new Promise<void>((resolve) => {
      releaseSaveSnapshot = resolve;
    });
    const saveSnapshot = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          void saveSnapshotStarted.then(resolve);
        })
    );
    const snapshotStore = {
      saveSnapshot,
      loadLatestSnapshot: async () => undefined
    };

    const service = await createSimulationService({
      commandStore,
      eventStore,
      snapshotStore: snapshotStore as unknown as InMemorySimulationSnapshotStore,
      port: 0,
      startupReplayCompactionMinEvents: 1,
      checkpointMaxRssBytes: 1,
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    expect(service.startupRecovery.recoveredEventCount).toBe(2);
    expect(saveSnapshot).toHaveBeenCalledTimes(0);

    await expect(service.start()).resolves.toMatchObject({
      host: "127.0.0.1",
      port: expect.any(Number)
    });

    await vi.waitFor(() => {
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(saveSnapshot.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        lastAppliedEventId: 2
      })
    );

    releaseSaveSnapshot?.();
    await service.close();
  });
});
