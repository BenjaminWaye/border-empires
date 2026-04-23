import { describe, expect, it } from "vitest";

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

  it("does not overlay seed tiles onto db-backed recovered snapshot tiles", async () => {
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
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual(expect.objectContaining({ x: 99, y: 99, ownerId: "player-1" }));
    await service.close();
  });
});
