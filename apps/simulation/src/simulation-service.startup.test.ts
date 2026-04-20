import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "./command-store.js";
import { InMemorySimulationSnapshotStore } from "./snapshot-store.js";
import { createSimulationService } from "./simulation-service.js";
import type { SimulationEventStore } from "./event-store.js";

describe("simulation service startup recovery", () => {
  it("falls back to the seed world when seed-profile recovery times out", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const eventStore: SimulationEventStore = {
      appendEvent: async () => undefined,
      loadAllEvents: () =>
        new Promise(() => {
          // Intentionally unresolved to simulate a dead startup recovery path.
        }),
      loadEventsAfter: async () => [],
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
      loadAllEvents: () =>
        new Promise(() => {
          // Intentionally unresolved to simulate a dead startup recovery path.
        }),
      loadEventsAfter: async () => [],
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
});
