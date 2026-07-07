import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import { generateSeasonWorld } from "../season-worldgen/season-worldgen.js";
import { createSeedWorld } from "../seed-state/seed-state.js";
import { createInitialSeasonState } from "../season-lifecycle.js";
import { createSimulationService } from "./simulation-service.js";
import type { SimulationEventStore } from "../event-store/event-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";

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
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
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
  }, 90_000);

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
        requireDurableStartupState: true,
        commandStore,
        eventStore,
        snapshotStore,
        seasonSummaryStore: new InMemorySeasonSummaryStore(),
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
        requireDurableStartupState: true,
        commandStore,
        eventStore,
        snapshotStore,
        seasonSummaryStore: new InMemorySeasonSummaryStore(),
        log: {
          info: () => undefined,
          error: () => undefined
        }
      })
    ).rejects.toThrow(
      "simulation startup recovery requires durable state but no snapshot, events, or bootstrap state were found"
    );
  });

  it("allows explicit local seeded startup against an empty db-backed store", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      allowSeedRecoveryFallback: true,
      requireDurableStartupState: false,
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
    await service.close();
  }, 15_000);

  it("normalizes truthy autopilot flags when callers pass string values at runtime", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      enableAiAutopilot: "1" as unknown as boolean,
      log: {
        info: () => undefined,
        error: () => undefined,
        warn: () => undefined
      }
    });

    expect(service.renderMetrics()).toContain("sim_ai_autopilot_enabled 1");
    expect(service.renderMetrics()).toContain("sim_ai_autopilot_player_count 20");
    await service.close();
  }, 15_000);

  it("uses recovered player identities for AI autopilot instead of seed-profile fallbacks", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    // Generate snapshot with 10 AI; service is started with "season-20ai" seed.
    // Test verifies the recovered snapshot count wins, not the seed profile.
    const generated = await generateSeasonWorld("seasonal-default", 12345, { aiPlayerCount: 10 });
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: generated.initialState,
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      enableAiAutopilot: true,
      log: {
        info: () => undefined,
        error: () => undefined,
        warn: () => undefined
      }
    });

    expect(service.renderMetrics()).toContain("sim_ai_autopilot_enabled 1");
    expect(service.renderMetrics()).toContain("sim_ai_autopilot_player_count 10");
    await service.close();
  }, 30_000);

  it("bootstraps the first managed season from ruleset worldgen when durable stores are empty", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();

    const service = await createSimulationService({
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      rulesetId: "seasonal-default",
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    expect(service.startupRecovery.initialState.season).toEqual(
      expect.objectContaining({
        seasonId: "season-1",
        seasonSequence: 1,
        rulesetId: "seasonal-default",
        status: "active",
        worldSeed: expect.any(Number)
      })
    );
    expect(service.startupRecovery.initialState.tiles.length).toBeGreaterThan(1000);
    expect(service.startupRecovery.initialState.tiles.filter((tile) => tile.town).length).toBeGreaterThan(50);
    expect(service.startupRecovery.initialState.tiles.some((tile) => tile.ownerId?.startsWith("player-"))).toBe(false);
    expect(service.startupRecovery.initialState.tiles.some((tile) => tile.ownerId?.startsWith("ai-"))).toBe(true);
    expect(
      service.startupRecovery.initialState.players?.filter((player) => player.id.startsWith("ai-")).length
    ).toBe(20);
    await service.close();
  }, 30_000);

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
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
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

  it("replaces a recovered seed-backed default world with the managed ruleset bootstrap", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const seasonSummaryStore = new InMemorySeasonSummaryStore();
    const seedWorld = createSeedWorld("default");
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [...seedWorld.tiles.values()],
          activeLocks: [],
          season: createInitialSeasonState({
            seasonSequence: 1,
            rulesetId: "seed:default",
            worldSeed: 42,
            startedAt: 1_000
          })
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore,
      rulesetId: "seasonal-default",
      seedProfile: "default",
      log: {
        info: () => undefined,
        error: () => undefined,
        warn: () => undefined
      }
    });

    expect(service.startupRecovery.initialState.season).toEqual(
      expect.objectContaining({
        seasonId: "season-1",
        seasonSequence: 1,
        rulesetId: "seasonal-default",
        status: "active",
        worldSeed: expect.any(Number)
      })
    );
    expect(service.startupRecovery.initialState.tiles.length).toBeGreaterThan(1000);
    expect(service.startupRecovery.initialState.tiles.some((tile) => tile.ownerId?.startsWith("ai-"))).toBe(true);
    expect(service.startupRecovery.initialState.tiles.some((tile) => tile.dockId)).toBe(true);
    await service.close();
  });

  it("refreshes the persisted current summary from recovered runtime state on startup", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const seasonSummaryStore = new InMemorySeasonSummaryStore();
    const generated = await generateSeasonWorld("seasonal-default", 12345);
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: generated.initialState,
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });
    await seasonSummaryStore.saveCurrentSummary({
      season: "season-1",
      seasonId: "season-1",
      seasonSequence: 1,
      status: "active",
      startedAt: 1_000,
      worldSeed: generated.worldSeed,
      rulesetId: "seasonal-default",
      leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
      overall: [],
      byTiles: [],
      byIncome: [],
      byTechs: [],
      seasonVictory: [],
      onlinePlayers: 0,
      totalPlayers: 0,
      townCount: 0,
      updatedAt: 1_000
    });

    const service = await createSimulationService({
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore,
      rulesetId: "seasonal-default",
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    await expect(seasonSummaryStore.loadCurrentSummary()).resolves.toEqual(
      expect.objectContaining({
        seasonId: "season-1",
        totalPlayers: expect.any(Number),
        townCount: expect.any(Number)
      })
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
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
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

  it("reports runtime identity and persistence health", async () => {
    const service = await createSimulationService({
      seedProfile: "season-20ai",
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore(),
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    expect(service.healthSnapshot()).toEqual(
      expect.objectContaining({
        ok: true,
        runtimeIdentity: expect.objectContaining({
          sourceType: "seed-profile",
          seasonId: expect.any(String),
          worldSeed: expect.any(Number),
          fingerprint: expect.any(String),
          playerCount: expect.any(Number),
          seededTileCount: expect.any(Number)
        }),
        persistence: expect.objectContaining({
          degraded: false,
          pendingCount: expect.any(Number)
        })
      })
    );

    await service.close();
  }, 15_000);

});
