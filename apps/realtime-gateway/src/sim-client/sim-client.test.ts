import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createSimulationClientFromRpcClient, startSimulationEventStream, type SimulationClientEvent } from "./sim-client.js";

class FakeStream extends EventEmitter {
  canceled = false;

  cancel(): void {
    this.canceled = true;
  }
}

describe("simulation event stream supervisor", () => {
  it("reconnects after a dropped stream and keeps delivering events", () => {
    vi.useFakeTimers();
    try {
      const streams = [new FakeStream(), new FakeStream()];
      let streamIndex = 0;
      const seen: SimulationClientEvent[] = [];
      const disconnects: Array<string | null> = [];
      const getStream = (index: number): FakeStream => {
        const stream = streams[index];
        if (!stream) throw new Error(`missing fake stream ${index}`);
        return stream;
      };

      startSimulationEventStream(
        () => getStream(Math.min(streamIndex++, streams.length - 1)),
        (event) => {
          seen.push(event);
        },
        {
          onDisconnect(error) {
            disconnects.push(error?.message ?? null);
          }
        }
      );

      getStream(0).emit("data", {
        event_type: "COMMAND_ACCEPTED",
        command_id: "cmd-1",
        player_id: "player-1",
        action_type: "ATTACK",
        origin_x: 10,
        origin_y: 10,
        target_x: 10,
        target_y: 11,
        resolves_at: 1234,
        code: "",
        message: "",
        attacker_won: false,
        combat_result_json: JSON.stringify({
          attackType: "ATTACK",
          attackerWon: true,
          origin: { x: 10, y: 10 },
          target: { x: 10, y: 11 },
          changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }],
          pointsDelta: 0,
          manpowerDelta: -24,
          pillagedGold: 0,
          pillagedShare: 0,
          pillagedStrategic: {},
          atkEff: 10,
          defEff: 0,
          winChance: 1,
          levelDelta: 0
        }),
        tile_delta_json: "",
        tile_deltas: []
      });
      getStream(0).emit("error", new Error("Connection dropped"));
      getStream(0).emit("end");
      vi.advanceTimersByTime(250);
      getStream(1).emit("data", {
        event_type: "COMBAT_RESOLVED",
        command_id: "cmd-1",
        player_id: "player-1",
        action_type: "EXPAND",
        origin_x: 10,
        origin_y: 10,
        target_x: 10,
        target_y: 11,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: true,
        manpower_delta: -32,
        combat_result_json: JSON.stringify({
          attackType: "EXPAND",
          attackerWon: true,
          origin: { x: 10, y: 10 },
          target: { x: 10, y: 11 },
          changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }],
          pointsDelta: 0,
          manpowerDelta: -32,
          pillagedGold: 0,
          pillagedShare: 0,
          pillagedStrategic: {},
          atkEff: 10,
          defEff: 0,
          winChance: 1,
          levelDelta: 0
        }),
        tile_delta_json: "",
        tile_deltas: []
      });
      getStream(1).emit("data", {
        event_type: "TILE_DELTA_BATCH",
        command_id: "cmd-1",
        player_id: "player-1",
        action_type: "",
        origin_x: 0,
        origin_y: 0,
        target_x: 0,
        target_y: 0,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: false,
        tile_delta_json: "",
        tile_deltas: [{ x: 10, y: 11, owner_id: "player-1", ownership_state: "FRONTIER" }]
      });

      expect(disconnects).toEqual(["Connection dropped"]);
      expect(seen).toEqual([
        {
          eventType: "COMMAND_ACCEPTED",
          commandId: "cmd-1",
          playerId: "player-1",
          actionType: "ATTACK",
          originX: 10,
          originY: 10,
          targetX: 10,
          targetY: 11,
          resolvesAt: 1234,
          combatResult: expect.objectContaining({
            attackType: "ATTACK",
            attackerWon: true,
            manpowerDelta: -24
          })
        },
        {
          eventType: "COMBAT_RESOLVED",
          commandId: "cmd-1",
          playerId: "player-1",
          actionType: "EXPAND",
          originX: 10,
          originY: 10,
          targetX: 10,
          targetY: 11,
          attackerWon: true,
          manpowerDelta: -32,
          combatResult: expect.objectContaining({
            attackType: "EXPAND",
            attackerWon: true,
            manpowerDelta: -32
          })
        },
        {
          eventType: "TILE_DELTA_BATCH",
          commandId: "cmd-1",
          playerId: "player-1",
          tileDeltas: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports stream connect and disconnect transitions", () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const transitions: string[] = [];

      startSimulationEventStream(
        () => stream,
        () => undefined,
        {
          onConnect() {
            transitions.push("connect");
          },
          onDisconnect(error) {
            transitions.push(error?.message ?? "disconnect");
          }
        }
      );

      stream.emit("error", new Error("stream dropped"));

      expect(transitions).toEqual(["connect", "stream dropped"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends subscribe and unsubscribe requests through the rpc client", async () => {
    const rpcClient = {
      SubmitCommand: vi.fn(),
      PreparePlayer: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean; player_id: string; spawned: boolean }) => void) =>
        callback(null, { ok: true, player_id: "player-1", spawned: true })
      ),
      SubscribePlayer: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean; player_id: string; tiles: Array<{ x: number; y: number }> }) => void) =>
        callback(null, { ok: true, player_id: "player-1", tiles: [{ x: 10, y: 10 }] })
      ),
      UnsubscribePlayer: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean }) => void) =>
        callback(null, { ok: true })
      ),
      GetSubscriptionNamespace: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean; namespace: string }) => void) =>
        callback(null, { ok: true, namespace: "1" })
      ),
      Ping: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean }) => void) =>
        callback(null, { ok: true })
      ),
      StreamEvents: vi.fn()
    };
    const client = createSimulationClientFromRpcClient(rpcClient);

    await expect(client.preparePlayer("player-1")).resolves.toEqual({
      playerId: "player-1",
      spawned: true
    });
    await expect(client.subscribePlayer("player-1", "{\"radius\":2}")).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
    await client.unsubscribePlayer("player-1");
    await expect((client as typeof client & { getSubscriptionNamespace: () => Promise<string> }).getSubscriptionNamespace()).resolves.toBe("1");

    expect(rpcClient.PreparePlayer).toHaveBeenCalledWith(
      { player_id: "player-1" },
      expect.any(Function)
    );
    expect(rpcClient.SubscribePlayer).toHaveBeenCalledWith(
      { player_id: "player-1", subscription_json: "{\"radius\":2}" },
      expect.any(Function)
    );
    expect(rpcClient.UnsubscribePlayer).toHaveBeenCalledWith(
      { player_id: "player-1" },
      expect.any(Function)
    );
    expect(rpcClient.GetSubscriptionNamespace).toHaveBeenCalledWith(
      {},
      expect.any(Function)
    );
    await expect(client.ping()).resolves.toBeUndefined();
    expect(rpcClient.Ping).toHaveBeenCalledWith(
      expect.objectContaining({ at: expect.any(Number) }),
      expect.any(Function)
    );
  });

  it("parses dock routes from subscribe responses", async () => {
    const SubscribePlayer = vi.fn((_request, callback: (error: Error | null, response: {
      ok: boolean;
      player_id: string;
      world_status_json?: string;
      season_json?: string;
      docks?: Array<{ dock_id: string; tile_key: string; paired_dock_id: string; connected_dock_ids?: string[] }>;
      tiles: Array<{ x: number; y: number; dock_id?: string }>;
    }) => void) =>
      callback(null, {
        ok: true,
        player_id: "player-1",
        season_json: JSON.stringify({ seasonId: "season-managed", seasonSequence: 2, rulesetId: "seasonal-default", worldSeed: 4242, status: "active", startedAt: 1000, victoryTrackers: [] }),
        docks: [
          { dock_id: "dock-a", tile_key: "10,10", paired_dock_id: "dock-b" },
          { dock_id: "dock-b", tile_key: "90,90", paired_dock_id: "dock-a", connected_dock_ids: ["dock-a"] }
        ],
        tiles: [{ x: 10, y: 10, dock_id: "dock-a" }]
      })
    );
    const client = createSimulationClientFromRpcClient({
      SubmitCommand: vi.fn(),
      PreparePlayer: vi.fn(),
      SubscribePlayer,
      UnsubscribePlayer: vi.fn(),
      Ping: vi.fn(),
      StreamEvents: vi.fn()
    } as never);

    await expect(client.subscribePlayer("player-1")).resolves.toEqual({
      playerId: "player-1",
      season: { seasonId: "season-managed", seasonSequence: 2, rulesetId: "seasonal-default", worldSeed: 4242, status: "active", startedAt: 1000, victoryTrackers: [] },
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b" },
        { dockId: "dock-b", tileKey: "90,90", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      tiles: [{ x: 10, y: 10, dockId: "dock-a" }]
    });
  });

  it("accepts player snapshots even if the grpc layer surfaces camelCase snapshotJson", async () => {
    const rpcClient = {
      SubmitCommand: vi.fn(),
      PreparePlayer: vi.fn(),
      SubscribePlayer: vi.fn((_request, callback: (error: Error | null, response: { ok: boolean; snapshot?: string; snapshotJson?: string }) => void) =>
        callback(null, {
          ok: true,
          snapshot: "",
          snapshotJson: JSON.stringify({ playerId: "player-1", tiles: [{ x: 10, y: 10, ownerId: "player-1" }] })
        })
      ),
      UnsubscribePlayer: vi.fn(),
      Ping: vi.fn(),
      StreamEvents: vi.fn()
    };
    const client = createSimulationClientFromRpcClient(rpcClient);

    await expect(client.subscribePlayer("player-1")).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10, ownerId: "player-1" }]
    });
  });

  it("accepts player snapshots from unknown unary response key casing", async () => {
    const rpcClient = {
      SubmitCommand: vi.fn(),
      PreparePlayer: vi.fn(),
      SubscribePlayer: vi.fn((_request, callback: (error: Error | null, response: Record<string, unknown>) => void) =>
        callback(null, {
          ok: true,
          snapshotJSON: JSON.stringify({ playerId: "player-1", tiles: [{ x: 11, y: 10, ownerId: "player-1" }] })
        })
      ),
      UnsubscribePlayer: vi.fn(),
      Ping: vi.fn(),
      StreamEvents: vi.fn()
    };
    const client = createSimulationClientFromRpcClient(rpcClient as any);

    await expect(client.subscribePlayer("player-1")).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 11, y: 10, ownerId: "player-1" }]
    });
  });

  it("accepts typed player snapshots from the grpc layer", async () => {
    const rpcClient = {
      SubmitCommand: vi.fn(),
      PreparePlayer: vi.fn(),
      SubscribePlayer: vi.fn((_request, callback: (error: Error | null, response: Record<string, unknown>) => void) =>
        callback(null, {
          ok: true,
          player_id: "player-1",
          world_status_json: JSON.stringify({
            leaderboard: {
              overall: [{ id: "ai-1", name: "AI 1", tiles: 4, incomePerMinute: 2.4, techs: 1, score: 120, rank: 1 }],
              byTiles: [{ id: "ai-1", name: "AI 1", value: 4, rank: 1 }],
              byIncome: [{ id: "ai-1", name: "AI 1", value: 2.4, rank: 1 }],
              byTechs: [{ id: "ai-1", name: "AI 1", value: 1, rank: 1 }]
            },
            seasonVictory: []
          }),
          tiles: [
            {
              x: 11,
              y: 10,
              terrain: "LAND",
              resource: "FARM",
              owner_id: "player-1",
              ownership_state: "FRONTIER",
              town_type: "FARMING",
              town_name: "Nauticus",
              town_population_tier: "SETTLEMENT",
              yield: { gold: 0.5, strategic: { FOOD: 4 } },
              yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
              yieldCap: { gold: 480, strategicEach: 16 }
            }
          ]
        })
      ),
      UnsubscribePlayer: vi.fn(),
      Ping: vi.fn(),
      StreamEvents: vi.fn()
    };
    const client = createSimulationClientFromRpcClient(rpcClient as any);

    await expect(client.subscribePlayer("player-1")).resolves.toEqual({
      playerId: "player-1",
      worldStatus: {
        leaderboard: {
          overall: [{ id: "ai-1", name: "AI 1", tiles: 4, incomePerMinute: 2.4, techs: 1, score: 120, rank: 1 }],
          byTiles: [{ id: "ai-1", name: "AI 1", value: 4, rank: 1 }],
          byIncome: [{ id: "ai-1", name: "AI 1", value: 2.4, rank: 1 }],
          byTechs: [{ id: "ai-1", name: "AI 1", value: 1, rank: 1 }]
        },
        seasonVictory: []
      },
      tiles: [
        {
          x: 11,
          y: 10,
          terrain: "LAND",
          resource: "FARM",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          townType: "FARMING",
          townName: "Nauticus",
          townPopulationTier: "SETTLEMENT",
          yield: { gold: 0.5, strategic: { FOOD: 4 } },
          yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
          yieldCap: { gold: 480, strategicEach: 16 }
        }
      ]
    });
  });

  it("accepts tile delta batches even if the grpc layer surfaces camelCase tileDeltaJson", () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const seen: SimulationClientEvent[] = [];

      startSimulationEventStream(
        () => stream,
        (event) => {
          seen.push(event);
        }
      );

      stream.emit("data", {
        event_type: "TILE_DELTA_BATCH",
        command_id: "cmd-2",
        player_id: "player-1",
        action_type: "",
        origin_x: 0,
        origin_y: 0,
        target_x: 0,
        target_y: 0,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: false,
        tile_delta_json: "",
        tileDeltaJson: "",
        tile_deltas: [{ x: 10, y: 11, owner_id: "player-1", ownership_state: "FRONTIER" }]
      });

      expect(seen).toEqual([
        {
          eventType: "TILE_DELTA_BATCH",
          commandId: "cmd-2",
          playerId: "player-1",
          tileDeltas: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps cancelled command ids on COMBAT_CANCELLED stream events", () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const seen: SimulationClientEvent[] = [];

      startSimulationEventStream(
        () => stream,
        (event) => {
          seen.push(event);
        }
      );

      stream.emit("data", {
        event_type: "COMBAT_CANCELLED",
        command_id: "cancel-capture-1",
        player_id: "player-1",
        action_type: "",
        origin_x: 0,
        origin_y: 0,
        target_x: 0,
        target_y: 0,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: false,
        tile_delta_json: "",
        tile_deltas: [],
        count: 1,
        cancelled_command_ids: ["expand-cmd-1"]
      });

      expect(seen).toEqual([
        {
          eventType: "COMBAT_CANCELLED",
          commandId: "cancel-capture-1",
          playerId: "player-1",
          count: 1,
          cancelledCommandIds: ["expand-cmd-1"]
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves explicit empty structure fields so downstream clients can clear removed structures", () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const seen: SimulationClientEvent[] = [];

      startSimulationEventStream(
        () => stream,
        (event) => {
          seen.push(event);
        }
      );

      stream.emit("data", {
        event_type: "TILE_DELTA_BATCH",
        command_id: "cmd-clear-1",
        player_id: "player-1",
        action_type: "",
        origin_x: 0,
        origin_y: 0,
        target_x: 0,
        target_y: 0,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: false,
        tile_delta_json: "",
        tile_deltas: [
          {
            x: 10,
            y: 11,
            owner_id: "player-1",
            ownership_state: "SETTLED",
            fort_json: "",
            observatory_json: "",
            siege_outpost_json: "",
            economic_structure_json: ""
          }
        ]
      });

      expect(seen).toEqual([
        {
          eventType: "TILE_DELTA_BATCH",
          commandId: "cmd-clear-1",
          playerId: "player-1",
          tileDeltas: [
            {
              x: 10,
              y: 11,
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fortJson: undefined,
              observatoryJson: undefined,
              siegeOutpostJson: undefined,
              economicStructureJson: undefined
            }
          ]
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips internal-only simulation event types so they cannot masquerade as empty COMMAND_REJECTED", () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const seen: SimulationClientEvent[] = [];
      const unknown: string[] = [];

      startSimulationEventStream(
        () => stream,
        (event) => {
          seen.push(event);
        },
        {
          onUnknownEvent: (eventType) => {
            unknown.push(eventType);
          }
        }
      );

      stream.emit("data", {
        event_type: "TILE_YIELD_ANCHOR_UPDATED",
        command_id: "accrual:upkeep:human-1:1700000000000",
        player_id: "human-1",
        action_type: "",
        origin_x: 0,
        origin_y: 0,
        target_x: 0,
        target_y: 0,
        resolves_at: 0,
        code: "",
        message: "",
        attacker_won: false,
        tile_delta_json: "",
        tile_deltas: [],
        count: 0
      });

      expect(seen).toEqual([]);
      expect(unknown).toEqual(["TILE_YIELD_ANCHOR_UPDATED"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
