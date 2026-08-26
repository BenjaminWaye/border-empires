import { describe, expect, it, vi } from "vitest";
import { handleJoinSeasonMessage, type JoinSeasonMessageDeps } from "./handle-join-season-message.js";

const buildDeps = (overrides: Partial<JoinSeasonMessageDeps> = {}): JoinSeasonMessageDeps & { sent: unknown[] } => {
  const sent: unknown[] = [];
  return {
    playerId: "player-1",
    rallyAnchor: undefined,
    simulationClient: {
      preparePlayer: vi.fn(),
      joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: true }))
    },
    recordGatewayEvent: vi.fn(),
    sendJson: (_socket, payload) => {
      sent.push(payload);
    },
    socket: {} as JoinSeasonMessageDeps["socket"],
    seasonFullErrorPayload: () => ({ type: "ERROR", code: "SEASON_FULL", message: "full" }),
    seasonPendingErrorPayload: (scheduledStartAt) => ({
      type: "ERROR",
      code: "SEASON_PENDING",
      message: "not yet",
      scheduledStartAt
    }),
    sent,
    ...overrides
  } as JoinSeasonMessageDeps & { sent: unknown[] };
};

describe("handleJoinSeasonMessage", () => {
  it("sends JOIN_SEASON_ACK on a normal join", async () => {
    const deps = buildDeps();
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toEqual([{ type: "JOIN_SEASON_ACK", spawned: true }]);
  });

  it("sends SEASON_PENDING with scheduledStartAt when the season hasn't started yet", async () => {
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, pending: true, scheduledStartAt: 1_800_000_000_000 }))
      }
    });
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toEqual([{ type: "ERROR", code: "SEASON_PENDING", message: "not yet", scheduledStartAt: 1_800_000_000_000 }]);
  });

  it("falls back to the current time for scheduledStartAt if the simulation omits it", async () => {
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, pending: true }))
      }
    });
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toHaveLength(1);
    expect((deps.sent[0] as { code: string }).code).toBe("SEASON_PENDING");
  });

  it("checks the player into the lobby roster and broadcasts when pending and deps are provided", async () => {
    const checkIntoLobby = vi.fn(async () => ({ name: "Alice", countryFlag: "US" }));
    const broadcastLobbyUpdate = vi.fn();
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, pending: true, scheduledStartAt: 1_800_000_000_000 }))
      },
      checkIntoLobby,
      broadcastLobbyUpdate
    });
    await handleJoinSeasonMessage(deps);
    expect(checkIntoLobby).toHaveBeenCalledWith("player-1");
    expect(broadcastLobbyUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not touch the lobby roster when the join is not pending", async () => {
    const checkIntoLobby = vi.fn(async () => ({ name: "Alice" }));
    const broadcastLobbyUpdate = vi.fn();
    const deps = buildDeps({ checkIntoLobby, broadcastLobbyUpdate });
    await handleJoinSeasonMessage(deps);
    expect(checkIntoLobby).not.toHaveBeenCalled();
    expect(broadcastLobbyUpdate).not.toHaveBeenCalled();
  });

  it("sends SEASON_FULL when the join is rejected as full", async () => {
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, full: true }))
      }
    });
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toEqual([{ type: "ERROR", code: "SEASON_FULL", message: "full" }]);
  });

  it("includes spawnTile in the ack when the join spawned territory and resolveSpawnTile resolves", async () => {
    const resolveSpawnTile = vi.fn(async () => ({ x: 155, y: 227 }));
    const deps = buildDeps({ resolveSpawnTile });
    await handleJoinSeasonMessage(deps);
    expect(resolveSpawnTile).toHaveBeenCalledWith("player-1");
    expect(deps.sent).toEqual([{ type: "JOIN_SEASON_ACK", spawned: true, spawnTile: { x: 155, y: 227 } }]);
  });

  it("omits spawnTile when the join did not spawn territory, without calling resolveSpawnTile", async () => {
    const resolveSpawnTile = vi.fn(async () => ({ x: 155, y: 227 }));
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, joined: true }))
      },
      resolveSpawnTile
    });
    await handleJoinSeasonMessage(deps);
    expect(resolveSpawnTile).not.toHaveBeenCalled();
    expect(deps.sent).toEqual([{ type: "JOIN_SEASON_ACK", spawned: false }]);
  });

  it("still sends the ack without spawnTile when resolveSpawnTile rejects", async () => {
    const resolveSpawnTile = vi.fn(async () => {
      throw new Error("sim unavailable");
    });
    const deps = buildDeps({ resolveSpawnTile });
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toEqual([{ type: "JOIN_SEASON_ACK", spawned: true }]);
  });

  it("sends JOIN_SEASON_FAILED when the simulation call throws", async () => {
    const deps = buildDeps({
      simulationClient: {
        preparePlayer: vi.fn(),
        joinSeason: vi.fn(async () => {
          throw new Error("boom");
        })
      }
    });
    await handleJoinSeasonMessage(deps);
    expect(deps.sent).toEqual([{ type: "ERROR", code: "JOIN_SEASON_FAILED", message: "Could not join the season. Try again." }]);
  });
});
