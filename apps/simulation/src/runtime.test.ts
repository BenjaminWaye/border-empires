import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

type SimulationRuntimeEventShape = SimulationEvent;

describe("simulation runtime", () => {
  it("spawns a settled tile for unknown subscribed players", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    const changed = runtime.ensurePlayerHasSpawnTerritory("firebase-user-1");
    expect(changed).toBe(true);

    const state = runtime.exportState();
    expect(state.players.some((player) => player.id === "firebase-user-1")).toBe(true);
    expect(
      state.tiles.some(
        (tile) => tile.x === 10 && tile.y === 11 && tile.ownerId === "firebase-user-1" && tile.ownershipState === "SETTLED"
      )
    ).toBe(true);
  });

  it("does not respawn players that already have territory", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    const changed = runtime.ensurePlayerHasSpawnTerritory("player-1");
    expect(changed).toBe(false);

    const state = runtime.exportState();
    expect(state.tiles.filter((tile) => tile.ownerId === "player-1")).toHaveLength(1);
  });

  it("regenerates manpower from elapsed time before exporting player state", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 0,
            manpowerUpdatedAt: 0,
            manpowerCapSnapshot: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });

    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.manpower).toBe(10);
  });

  it("accepts a human frontier command before queued AI work drains", async () => {
    const runtime = new SimulationRuntime({ now: () => 1_000 });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(event.eventType);
    });
    for (let index = 0; index < 100; index += 1) {
      runtime.enqueueBackgroundJob(() => {
        const values = Array.from({ length: 200 }, (_, value) => value + index);
        values.reverse();
      });
    }

    runtime.submitCommand({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
  });

  it("accepts diagonal frontier attacks to match legacy adjacency rules", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 10_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: true,
            points: 10_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 24, y: 245, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 23, y: 246, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(event.eventType);
    });

    runtime.submitCommand({
      commandId: "cmd-diagonal",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 24, fromY: 245, toX: 23, toY: 246 })
    });

    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
  });

  it("emits a fresh player update after collecting buffered tile yield", async () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 0,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      seen.push(event);
    });

    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    expect(seen.map((event) => event.eventType)).toContain("COLLECT_RESULT");
    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    expect(playerUpdateEvent).toEqual(
      expect.objectContaining({
        playerId: "player-1",
        messageType: "PLAYER_UPDATE"
      })
    );
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as { gold?: number };
    expect(payload.gold).toBeGreaterThan(0.9);
  });

  it("prefers SETTLE for AI automation when strategic frontier land is available and a development slot is free", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 100,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER", resource: "FARM" }
        ],
        activeLocks: []
      }
    });

    expect(runtime.chooseNextAutomationCommand("ai-1", 3, 1_000, "ai-runtime")).toEqual(
      expect.objectContaining({
        playerId: "ai-1",
        clientSeq: 3,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 11, y: 10 })
      })
    );
  });

  it("prefers settling a town frontier tile over plain land for AI automation", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 100,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER", resource: "FARM" },
          {
            x: 12,
            y: 10,
            terrain: "LAND",
            ownerId: "ai-1",
            ownershipState: "FRONTIER",
            town: { name: "Qadarstrand", type: "MARKET", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });

    expect(runtime.chooseNextAutomationCommand("ai-1", 3, 1_000, "ai-runtime")).toEqual(
      expect.objectContaining({
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 12, y: 10 })
      })
    );
  });

  it("lets AI continue filling open development slots instead of waiting for all pending settlements to finish", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 100,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER", resource: "FARM" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER", resource: "IRON" }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "settle-1",
      sessionId: "ai-runtime:ai-1",
      playerId: "ai-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 11, y: 10 })
    });
    await Promise.resolve();

    expect(runtime.chooseNextAutomationCommand("ai-1", 2, 1_000, "ai-runtime")).toEqual(
      expect.objectContaining({
        playerId: "ai-1",
        clientSeq: 2,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 12, y: 10 })
      })
    );
  });

  it("does not choose unaffordable frontier actions for AI automation", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 0,
            manpower: 0,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 9, y: 10, terrain: "LAND", ownerId: "enemy-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    expect(runtime.chooseNextAutomationCommand("ai-1", 1, 1_000, "ai-runtime")).toBeUndefined();
  });

  it("does not auto-settle worthless plain frontier land when no strategic frontier settlement exists", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "ai-1",
          {
            id: "ai-1",
            isAi: true,
            points: 100,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
          { x: 12, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    expect(runtime.chooseNextAutomationCommand("ai-1", 1, 1_000, "ai-runtime")).toEqual(
      expect.objectContaining({
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 11, fromY: 10, toX: 12, toY: 10 })
      })
    );
  });

  it("replays existing events for duplicate command ids instead of reprocessing", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000 });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      const command = {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      };

      runtime.submitCommand(command);
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      runtime.submitCommand(command);

      expect(seen).toEqual([
        "COMMAND_ACCEPTED:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_DELTA_BATCH:cmd-1:respawn:player-2",
        "COMMAND_ACCEPTED:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
        "PLAYER_MESSAGE:cmd-1"
      ]);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("persists expand ownership into authoritative state after resolution", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 11,
          y: 10,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("recovers stale frontier origin payloads by selecting a valid owned adjacent origin server-side", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 11, y: 10, terrain: "LAND" },
            { x: 9, y: 9, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationRuntimeEventShape[] = [];
      runtime.onEvent((event) => {
        seen.push(event);
      });

      runtime.submitCommand({
        commandId: "expand-stale-origin-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 9, fromY: 9, toX: 11, toY: 10 })
      });

      await Promise.resolve();

      const accepted = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMMAND_ACCEPTED" }> => event.eventType === "COMMAND_ACCEPTED"
      );
      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED");
      expect(rejected).toBeUndefined();
      expect(accepted).toEqual(
        expect.objectContaining({
          commandId: "expand-stale-origin-1",
          actionType: "EXPAND",
          originX: 10,
          originY: 10,
          targetX: 11,
          targetY: 10
        })
      );

      vi.advanceTimersByTime(3_100);
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 11,
          y: 10,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("can resolve an attack as a loss and leave the defender tile owned by the defender", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 100,
              manpower: 150,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ],
          [
            "player-2",
            {
              id: "player-2",
              isAi: true,
              points: 100,
              manpower: 150,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationRuntimeEventShape[] = [];
      runtime.onEvent((event) => {
        seen.push(event);
      });

      runtime.submitCommand({
        commandId: "lose-attack-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const combatResult = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
      expect(combatResult).toEqual(
        expect.objectContaining({
          commandId: "lose-attack-1",
          attackerWon: false,
          manpowerDelta: expect.any(Number)
        })
      );
      expect((combatResult?.manpowerDelta ?? 0) < -0.01).toBe(true);

      const exported = runtime.exportState();
      expect((exported.players.find((entry) => entry.id === "player-1")?.manpower ?? 0) < 150).toBe(true);
      expect(exported.tiles.find((tile) => tile.x === 10 && tile.y === 11)).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "SETTLED"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("charges 1 gold when a neutral expand resolves", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 100,
              manpower: 150,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
            }
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-cost-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(99);
    } finally {
      vi.useRealTimers();
    }
  });

  it("always resolves neutral EXPAND as a successful frontier capture", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 100,
              manpower: 150,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-always-success",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10)).toEqual(
        expect.objectContaining({
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("emits plunder details for settled captures so victory popups can show loot", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 1_000,
              manpower: 10_000,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ],
          [
            "player-2",
            {
              id: "player-2",
              isAi: true,
              points: 900,
              manpower: 10_000,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Beejac", type: "FARMING", populationTier: "SETTLEMENT" }
            }
          ],
          activeLocks: []
        }
      });
      const seen: Array<Record<string, unknown>> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMBAT_RESOLVED") seen.push(event as unknown as Record<string, unknown>);
      });

      runtime.submitCommand({
        commandId: "cmd-plunder",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(seen).toContainEqual(
        expect.objectContaining({
          commandId: "cmd-plunder",
          pillagedGold: expect.any(Number)
        })
      );
      const plunderEvent = seen.find((event) => event.commandId === "cmd-plunder");
      expect((plunderEvent?.pillagedGold as number) ?? 0).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("builds a fort through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["masonry"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { IRON: 100 }
            }
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
            }
          ],
          activeLocks: []
        }
      });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          seen.push(event.tileDeltas[0]?.fortJson ? "fort" : "other");
        }
      });

      runtime.submitCommand({
        commandId: "fort-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 10,
          y: 10,
          fortJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(exported?.fortJson).toContain("\"status\":\"active\"");
      expect(seen).toContain("fort");
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes an active fort through the rewrite simulation path and clears its tile state", async () => {
    vi.useFakeTimers();
    try {
      const scheduled: Array<{ delayMs: number; task: () => void }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduled.push({ delayMs, task });
        },
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["masonry"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { IRON: 100 }
            }
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "active" }
            }
          ],
          activeLocks: []
        }
      });
      const seen: Array<{ commandId: string; fortJson?: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          const tile = event.tileDeltas[0];
          if (tile) seen.push({ commandId: event.commandId, fortJson: tile.fortJson });
        }
      });

      runtime.submitCommand({
        commandId: "remove-fort-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "REMOVE_STRUCTURE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      const removingTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(removingTile?.fortJson).toContain("\"status\":\"removing\"");
      expect(scheduled).toHaveLength(1);

      scheduled[0]?.task();

      const removedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(removedTile?.fortJson).toBeUndefined();
      expect(seen).toHaveLength(2);
      expect(seen[0]).toEqual(
        expect.objectContaining({
          commandId: "remove-fort-cmd-1",
          fortJson: expect.stringContaining("\"status\":\"removing\"")
        })
      );
      expect(seen[1]).toEqual({
        commandId: "remove-fort-cmd-1",
        fortJson: undefined
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds an observatory through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["cartography"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { CRYSTAL: 100 }
            }
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 12,
              y: 12,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Lookout", type: "MARKET", populationTier: "TOWN" }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "obs-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_OBSERVATORY",
        payloadJson: JSON.stringify({ x: 12, y: 12 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 12,
          y: 12,
          observatoryJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("OBSERVATORY"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 12);
      expect(exported?.observatoryJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a siege outpost through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["leatherworking"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { SUPPLY: 100 }
            }
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 14,
              y: 14,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED"
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "siege-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 14,
          y: 14,
          siegeOutpostJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("SIEGE_OUTPOST"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 14 && tile.y === 14);
      expect(exported?.siegeOutpostJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a market through the rewrite simulation path and places it on a supported town tile", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["trade"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: {}
            }
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 16,
              y: 16,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
            },
            {
              x: 16,
              y: 17,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED"
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "market-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MARKET" })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 16,
          y: 17,
          economicStructureJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("MARKET"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      expect(exported?.economicStructureJson).toContain("\"type\":\"MARKET\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uncaptures an owned tile through the rewrite simulation path and clears owned structures on it", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          {
            x: 20,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "FUR_SYNTHESIZER",
              status: "active"
            }
          },
          {
            x: 21,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "uncapture-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 20, y: 20 })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
    expect(exportedTile).toEqual(expect.objectContaining({ x: 20, y: 20 }));
    expect(exportedTile?.ownerId).toBeUndefined();
    expect(exportedTile?.ownershipState).toBeUndefined();
    expect(exportedTile?.economicStructureJson).toBeUndefined();
  });

  it("overloads a ready synthesizer through the rewrite simulation path", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 20_000,
            manpower: 10_000,
            techIds: new Set<string>(["overload-protocols"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { SUPPLY: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 22,
            y: 22,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "FUR_SYNTHESIZER",
              status: "active"
            }
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "overload-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "OVERLOAD_SYNTHESIZER",
      payloadJson: JSON.stringify({ x: 22, y: 22 })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 22 && tile.y === 22);
    expect(exportedTile?.economicStructureJson).toContain("\"status\":\"inactive\"");
    expect(exportedTile?.economicStructureJson).toContain("\"disabledUntil\":86401000");
  });

  it("reenables converter structures through the rewrite simulation path", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 20_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: {}
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 24,
            y: 24,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "FUEL_PLANT",
              status: "inactive",
              inactiveReason: "manual"
            }
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "converter-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED",
      payloadJson: JSON.stringify({ x: 24, y: 24, enabled: true })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 24 && tile.y === 24);
    expect(exportedTile?.economicStructureJson).toContain("\"status\":\"active\"");
    expect(exportedTile?.economicStructureJson).toContain("\"nextUpkeepAt\":601000");
  });

  it("replays the original command outcome for duplicate player sequence numbers", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000 });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      runtime.submitCommand({
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      runtime.submitCommand({
        commandId: "cmd-2",
        sessionId: "session-2",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_005,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      expect(seen).toEqual([
        "COMMAND_ACCEPTED:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_DELTA_BATCH:cmd-1:respawn:player-2",
        "COMMAND_ACCEPTED:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
        "PLAYER_MESSAGE:cmd-1"
      ]);
      randomSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not swallow commands when recovered player-seq history has no replay events", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialCommandHistory: {
        commands: [
          {
            commandId: "recovered-cmd",
            sessionId: "session-1",
            playerId: "player-1",
            clientSeq: 1,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
            queuedAt: 900,
            status: "RESOLVED",
            resolvedAt: 950
          }
        ],
        eventsByCommandId: new Map()
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "new-cmd",
      sessionId: "session-2",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:new-cmd");
  });

  it("yields background lanes so a later human command is accepted before the rest of AI work", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000, backgroundBatchSize: 1 });
      const order: string[] = [];
      runtime.onEvent((event) => {
        order.push(event.eventType);
      });

      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_1");
      });
      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_2");
      });
      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_3");
      });

      await Promise.resolve();
      expect(order).toEqual(["AI_JOB_1"]);

      runtime.submitCommand({
        commandId: "cmd-3",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 3,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      expect(order[1]).toBe("COMMAND_ACCEPTED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes ai-runtime commands to the ai lane so queued human work stays ahead", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "ai-cmd",
      sessionId: "ai-runtime:ai-1",
      playerId: "ai-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 5, fromY: 0, toX: 4, toY: 0 })
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    expect(runtime.queueDepths()).toEqual({
      human_interactive: 1,
      human_noninteractive: 0,
      system: 0,
      ai: 1
    });

    for (const task of scheduled) task();
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:human-cmd");
  });

  it("routes system-runtime commands to the system lane so queued human work stays ahead", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "system-cmd",
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 123, fromY: 1, toX: 124, toY: 1 })
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    expect(runtime.queueDepths()).toEqual({
      human_interactive: 1,
      human_noninteractive: 0,
      system: 1,
      ai: 0
    });

    for (const task of scheduled) task();
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:human-cmd");
  });

  it("hydrates recovered tile ownership into authoritative startup state", () => {
    const runtime = new SimulationRuntime({
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: []
      }
    });

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 11,
        ownerId: "player-1",
        ownershipState: "FRONTIER",
        terrain: "LAND"
      })
    );
  });

  it("hydrates unresolved combat locks into authoritative startup state", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: [
          {
            commandId: "recovered-lock",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 10,
            targetY: 11,
            originKey: "10,10",
            targetKey: "10,11",
            resolvesAt: 4_000
          }
        ]
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") {
        seen.push(event.code);
      }
    });

    runtime.submitCommand({
      commandId: "cmd-after-restart",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["ATTACK_COOLDOWN"]);
  });

  it("returns LOCKED when origin tile lock is owned by another player", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 9, ownerId: "player-3", ownershipState: "FRONTIER" }
        ],
        activeLocks: [
          {
            commandId: "enemy-lock",
            playerId: "player-3",
            actionType: "ATTACK",
            originX: 10,
            originY: 9,
            targetX: 10,
            targetY: 10,
            originKey: "10,9",
            targetKey: "10,10",
            resolvesAt: 4_000
          }
        ]
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") seen.push(event.code);
    });

    runtime.submitCommand({
      commandId: "cmd-origin-locked-by-enemy",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["LOCKED"]);
  });

  it("resolves recovered combat locks after restart", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: [
          {
            commandId: "recovered-lock",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 10,
            targetY: 11,
            originKey: "10,10",
            targetKey: "10,11",
            resolvesAt: 1_500
          }
        ]
      }
    });

    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(500);

    scheduledTasks[0]?.task();

    expect(runtime.exportState().activeLocks).toEqual([]);
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 11,
        ownerId: "player-1",
        ownershipState: "FRONTIER",
        terrain: "LAND"
      })
    );
    randomSpy.mockRestore();
  });

  it("replays recovered command outcomes after restart instead of reprocessing", async () => {
    const runtime = new SimulationRuntime({
      initialCommandHistory: {
        commands: [
          {
            commandId: "cmd-1",
            sessionId: "session-1",
            playerId: "player-1",
            clientSeq: 1,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
            queuedAt: 1_000,
            status: "RESOLVED",
            acceptedAt: 1_100,
            resolvedAt: 1_200
          }
        ],
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
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 2_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["COMMAND_ACCEPTED:cmd-1", "COMBAT_RESOLVED:cmd-1"]);
  });

  it("requeues recovered queued commands after restart", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialCommandHistory: {
          commands: [
            {
              commandId: "cmd-queued",
              sessionId: "session-1",
              playerId: "player-1",
              clientSeq: 1,
              type: "ATTACK",
              payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
              queuedAt: 900,
              status: "QUEUED"
            }
          ],
          eventsByCommandId: new Map()
        }
      });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      await Promise.resolve();
      expect(seen[0]).toBe("COMMAND_ACCEPTED:cmd-queued");
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits reveal tile deltas around a hostile capture after combat resolution", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
            { x: 9, y: 11, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const tileDeltaEvents: Array<{ x: number; y: number; ownerId?: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          tileDeltaEvents.push(...event.tileDeltas);
        }
      });

      runtime.submitCommand({
        commandId: "cmd-delta",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 9,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(tileDeltaEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER", terrain: "LAND" }),
          expect.objectContaining({ x: 9, y: 11, terrain: "LAND" })
        ])
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("settles an owned frontier tile without inventing a town", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: []
      }
    });
    const seen: Array<{ eventType: string; commandId: string; playerId: string; tileDeltas?: unknown[] }> = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    runtime.submitCommand({
      commandId: "settle-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(60_000);

    scheduledTasks[0]?.task();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "TILE_DELTA_BATCH",
        commandId: "settle-1",
        playerId: "player-1",
        tileDeltas: [
          expect.objectContaining({
            x: 10,
            y: 10,
            ownerId: "player-1",
            ownershipState: "SETTLED"
          })
        ]
      })
    );
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 10,
        ownerId: "player-1",
        ownershipState: "SETTLED"
      })
    );
    const settledTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(settledTile?.townType).toBeUndefined();
    expect(settledTile?.townName).toBeUndefined();
  });

  it("strips synthetic settlement towns from recovered state", () => {
    const runtime = new SimulationRuntime({
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Settlement 12,18",
              type: "FARMING",
              populationTier: "SETTLEMENT"
            }
          }
        ],
        activeLocks: []
      }
    });

    const settledTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(settledTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        ownerId: "player-1",
        ownershipState: "SETTLED"
      })
    );
    expect(settledTile?.townType).toBeUndefined();
    expect(settledTile?.townName).toBeUndefined();
  });

  it("does not leak seed-only resources, towns, or structures back onto recovered tiles after restart", () => {
    const runtime = new SimulationRuntime({
      seedTiles: new Map([
        [
          "12,18",
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            resource: "GEMS",
            dockId: "dock-1",
            shardSite: { storedShard: 2, capacity: 4, generatedAt: 1_000 },
            town: {
              name: "Seed Town",
              type: "FARMING",
              populationTier: "TOWN"
            },
            fort: { ownerId: "player-1", status: "active" },
            observatory: { ownerId: "player-1", status: "active" },
            siegeOutpost: { ownerId: "player-1", status: "active" },
            economicStructure: {
              ownerId: "player-1",
              type: "MILL",
              status: "active",
              level: 1,
              enabled: true
            }
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });

    const recoveredTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(recoveredTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "FRONTIER"
      })
    );
    expect(recoveredTile?.resource).toBeUndefined();
    expect(recoveredTile?.dockId).toBeUndefined();
    expect(recoveredTile?.shardSite).toBeUndefined();
    expect(recoveredTile?.townType).toBeUndefined();
    expect(recoveredTile?.townName).toBeUndefined();
    expect(recoveredTile?.fort).toBeUndefined();
    expect(recoveredTile?.observatory).toBeUndefined();
    expect(recoveredTile?.siegeOutpost).toBeUndefined();
    expect(recoveredTile?.economicStructure).toBeUndefined();
  });

  it("backfills missing seed coordinates when recovered restart state is sparse", () => {
    const runtime = new SimulationRuntime({
      mergeSeedTilesWithInitialState: false,
      seedTiles: new Map([
        [
          "12,18",
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            resource: "GEMS"
          }
        ],
        [
          "12,19",
          {
            x: 12,
            y: 19,
            terrain: "SEA",
            resource: "FISH"
          }
        ]
      ]),
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });

    const recoveredOwnedTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(recoveredOwnedTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "FRONTIER"
      })
    );
    expect(recoveredOwnedTile?.resource).toBeUndefined();

    expect(runtime.exportState().tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 12,
          y: 19,
          terrain: "SEA",
          resource: "FISH"
        })
      ])
    );
  });

  it("enforces the development slot cap for settlements and emits live player updates", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      },
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            name: "Nauticus",
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
          }
        ]
      ])
    });
    const seen: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    for (const [index, x] of [10, 11, 12].entries()) {
      runtime.submitCommand({
        commandId: `settle-${index + 1}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: index + 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y: 10 })
      });
      await Promise.resolve();
    }

    const playerUpdateEvents = seen.filter(
      (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    ) as Array<SimulationRuntimeEventShape & { payloadJson: string }>;
    const latestStartUpdate = playerUpdateEvents.at(-1);
    expect(latestStartUpdate).toBeDefined();
    expect(JSON.parse(latestStartUpdate!.payloadJson)).toEqual(
      expect.objectContaining({
        gold: 88,
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 3,
        pendingSettlements: expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 10 }),
          expect.objectContaining({ x: 11, y: 10 }),
          expect.objectContaining({ x: 12, y: 10 })
        ])
      })
    );

    runtime.submitCommand({
      commandId: "settle-4",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 4,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 13, y: 10 })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "settle-4",
        playerId: "player-1",
        code: "SETTLE_INVALID",
        message: "development slots are busy"
      })
    );
  });

  it("restores player balances, pending settlements, and collect buffers from snapshot state after restart", () => {
    const settledEvents: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 10_000,
      scheduleAfter: (delayMs, task) => {
        settledEvents.push({ delayMs, task });
      },
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" }],
        activeLocks: [],
        players: [
          {
            id: "player-1",
            name: "Nauticus",
            points: 77,
            manpower: 123,
            manpowerUpdatedAt: 10_000,
            techIds: ["agriculture"],
            domainIds: ["river-kingdoms"],
            allies: [],
            strategicResources: { FOOD: 5 },
            incomeMultiplier: 1.25,
            vision: 2
          }
        ],
        pendingSettlements: [
          {
            ownerId: "player-1",
            tileKey: "10,10",
            startedAt: 5_000,
            resolvesAt: 70_000,
            goldCost: 3
          }
        ],
        tileYieldCollectedAtByTile: [{ tileKey: "10,10", collectedAt: 9_000 }],
        collectVisibleCooldownByPlayer: [{ playerId: "player-1", cooldownUntil: 25_000 }]
      }
    });

    const snapshot = runtime.exportSnapshotSections();
    const recovered = new SimulationRuntime({
      now: () => 10_000,
      scheduleAfter: (delayMs, task) => {
        settledEvents.push({ delayMs, task });
      },
      initialState: snapshot.initialState
    });
    const recoveredState = recovered.exportState();
    const recoveredPlayer = recoveredState.players.find((entry) => entry.id === "player-1");

    expect(recoveredPlayer).toEqual(
      expect.objectContaining({
        id: "player-1",
        name: "Nauticus",
        points: 77,
        manpower: 123,
        techIds: ["agriculture"],
        domainIds: ["river-kingdoms"],
        incomeMultiplier: 1.25
      })
    );
    expect(recoveredState.pendingSettlements).toEqual([
      expect.objectContaining({
        ownerId: "player-1",
        tileKey: "10,10",
        resolvesAt: 70_000
      })
    ]);
    expect(recoveredState.tileYieldCollectedAtByTile).toEqual([
      expect.objectContaining({ tileKey: "10,10", collectedAt: 9_000 })
    ]);
    expect(settledEvents.some((entry) => entry.delayMs === 60_000)).toBe(true);
  });

  it("emits reveal updates and revealed empire stats through player messages", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 10_000,
            manpower: 10_000,
            techIds: new Set<string>(["cryptography", "surveying"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { CRYSTAL: 1_000 }
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: true,
            points: 900,
            manpower: 700,
            techIds: new Set<string>(["cartography"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 4, IRON: 3, CRYSTAL: 2, SUPPLY: 1, SHARD: 0, OIL: 5 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const playerMessages: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "PLAYER_MESSAGE") playerMessages.push(JSON.parse(event.payloadJson) as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "reveal-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });
    runtime.submitCommand({
      commandId: "reveal-stats-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE_STATS",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });

    await Promise.resolve();

    expect(playerMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "REVEAL_EMPIRE_UPDATE", activeTargets: ["player-2"] }),
        expect.objectContaining({
          type: "REVEAL_EMPIRE_STATS_RESULT",
          stats: expect.objectContaining({ playerId: "player-2", settledTiles: 1, frontierTiles: 1 })
        })
      ])
    );
  });

  it("migrates siphon, purge, shard collection, and terrain shaping through authoritative tile deltas", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 20_000,
            manpower: 10_000,
            techIds: new Set<string>(["logistics", "terrain-engineering"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { CRYSTAL: 2_000, SHARD: 0 }
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: true,
            points: 1_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", sabotage: { ownerId: "player-2", endsAt: 2_000, outputMultiplier: 0.5 } },
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 2, y: 1, terrain: "MOUNTAIN" },
          { x: 1, y: 2, terrain: "LAND", shardSite: { kind: "CACHE", amount: 3 } }
        ],
        activeLocks: []
      }
    });
    const seen = new Map<string, unknown[]>();
    runtime.onEvent((event) => {
      const events = seen.get(event.commandId) ?? [];
      events.push(event);
      seen.set(event.commandId, events);
    });

    runtime.submitCommand({
      commandId: "siphon-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SIPHON_TILE",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });
    runtime.submitCommand({
      commandId: "purge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "PURGE_SIPHON",
      payloadJson: JSON.stringify({ x: 0, y: 1 })
    });
    runtime.submitCommand({
      commandId: "create-mountain-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "CREATE_MOUNTAIN",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
    runtime.submitCommand({
      commandId: "remove-mountain-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 4,
      issuedAt: 1_000,
      type: "REMOVE_MOUNTAIN",
      payloadJson: JSON.stringify({ x: 2, y: 1 })
    });
    runtime.submitCommand({
      commandId: "collect-shard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 5,
      issuedAt: 1_000,
      type: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 1, y: 2 })
    });

    await Promise.resolve();

    expect(JSON.stringify(seen.get("siphon-1"))).toContain("sabotageJson");
    expect(JSON.stringify(seen.get("purge-1"))).not.toContain("sabotageJson");
    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 1, y: 1, terrain: "MOUNTAIN" }));
    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 2, y: 1, terrain: "LAND" }));
    expect(JSON.stringify(seen.get("collect-shard-1"))).toContain("\"SHARD\":3");
  });

  it("publishes aether bridge and wall updates and blocks frontier crossings through active walls", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 20_000,
            manpower: 10_000,
            techIds: new Set<string>(["navigation", "harborcraft"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { CRYSTAL: 2_000 }
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: true,
            points: 1_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "SEA" },
          { x: 0, y: 4, terrain: "SEA" },
          { x: 0, y: 5, terrain: "LAND" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 3, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 5 })
    });
    runtime.submitCommand({
      commandId: "wall-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "CAST_AETHER_WALL",
      payloadJson: JSON.stringify({ x: 2, y: 2, direction: "E", length: 1 })
    });

    await Promise.resolve();

    runtime.submitCommand({
      commandId: "blocked-attack-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 2, fromY: 2, toX: 3, toY: 2 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "bridge-1",
        messageType: "AETHER_BRIDGE_UPDATE"
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "wall-1",
        messageType: "AETHER_WALL_UPDATE"
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "blocked-attack-1"
      })
    );
  });

  it("resolves airport bombardment through rewrite tile deltas", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 20_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { OIL: 10 }
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: true,
            points: 1_000,
            manpower: 10_000,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
          },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          { x: 2, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "bombard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 2 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "TILE_DELTA_BATCH",
        commandId: "bombard-1",
        tileDeltas: expect.arrayContaining([
          expect.objectContaining({ x: 2, y: 2 }),
          expect.objectContaining({ x: 2, y: 3 })
        ])
      })
    );
  });
});
