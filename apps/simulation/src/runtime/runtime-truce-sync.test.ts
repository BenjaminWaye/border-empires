import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("simulation runtime — truce sync", () => {
  it("syncs gateway truce changes into runtime player state", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")],
        ["player-2", buildPlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "sync-truce-1",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_TRUCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", truced: true })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.truces).toEqual(["player-2"]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.truces).toEqual(["player-1"]);
    // Truces, unlike alliances, must not add each other to `allies` — they
    // don't grant shared vision.
    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.allies).toEqual([]);
    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        messageType: "SOCIAL_STATE_SYNCED"
      })
    );

    runtime.submitCommand({
      commandId: "sync-truce-2",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 2_000,
      type: "SYNC_TRUCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", truced: false })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.truces).toEqual([]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.truces).toEqual([]);
  });

  it("blocks ATTACK against a truced player's tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000 })],
        ["player-2", buildPlayer("player-2", { manpower: 10_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "sync-truce-attack-block",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_TRUCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", truced: true })
    });
    await Promise.resolve();

    runtime.submitCommand({
      commandId: "attack-during-truce",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_500,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "attack-during-truce",
        code: "ALLY_TARGET"
      })
    );
    expect(runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10)?.ownerId).toBe("player-2");
  });

  it("blocks REVEAL_EMPIRE and REVEAL_EMPIRE_STATS against a truced player", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["cryptography", "surveying"]), strategicResources: { CRYSTAL: 1_000 } })
        ],
        [
          "player-2",
          buildPlayer("player-2", { isAi: true, points: 900, manpower: 700, techIds: new Set<string>(["cartography"]), strategicResources: { FOOD: 4, IRON: 3, CRYSTAL: 2, SUPPLY: 1, SHARD: 0 } })
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "truce-before-reveal",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_TRUCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", truced: true })
    });
    await Promise.resolve();

    runtime.submitCommand({
      commandId: "reveal-blocked-by-truce",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });
    runtime.submitCommand({
      commandId: "reveal-stats-blocked-by-truce",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE_STATS",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "reveal-blocked-by-truce", code: "REVEAL_EMPIRE_INVALID" })
    );
    expect(seen).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "reveal-stats-blocked-by-truce", code: "REVEAL_EMPIRE_STATS_INVALID" })
    );
  });
});
