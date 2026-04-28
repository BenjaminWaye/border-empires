import fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { Player, Season, Tile, TileKey } from "@border-empires/shared";
import { registerServerHttpRoutes } from "./server-http-routes.js";
import type { LeaderboardSnapshotView, SeasonArchiveEntry } from "./server-shared-types.js";

const makeSeason = (overrides: Partial<Season> = {}): Season => ({
  seasonId: "s-1",
  startAt: 1,
  endAt: 2,
  worldSeed: 123,
  techTreeConfigId: "broken-tree",
  status: "active",
  ...overrides
});

describe("server HTTP routes", () => {
  it("serves live season tech values instead of boot-time snapshots", async () => {
    const app = fastify();
    let activeSeason = makeSeason();
    let activeRootNodeIds: string[] = [];
    let activeTechNodeCount = 0;
    let archiveCount = 0;
    const leaderboard: LeaderboardSnapshotView = {
      overall: [{ id: "p1", name: "Ashen Reach", tiles: 42, incomePerMinute: 19, techs: 4, score: 131, rank: 1 }],
      selfOverall: undefined,
      selfByTiles: undefined,
      selfByIncome: undefined,
      selfByTechs: undefined,
      byTiles: [{ id: "p1", name: "Ashen Reach", value: 42, rank: 1 }],
      byIncome: [{ id: "p1", name: "Ashen Reach", value: 19, rank: 1 }],
      byTechs: [{ id: "p1", name: "Ashen Reach", value: 4, rank: 1 }]
    };
    const seasonVictory = [
      {
        id: "TOWN_CONTROL" as const,
        name: "Town Control",
        description: "Control half the towns.",
        leaderPlayerId: "p1",
        leaderName: "Ashen Reach",
        progressLabel: "21 / 50 towns",
        thresholdLabel: "50 towns",
        holdDurationSeconds: 86_400,
        statusLabel: "Under pressure",
        conditionMet: false
      }
    ];
    const seasonArchives: SeasonArchiveEntry[] = Array.from({ length: 6 }, (_, index) => ({
      seasonId: `s-${index + 1}`,
      endedAt: 100 + index,
      mostTerritory: Array.from({ length: 4 }, (__, row) => ({
        playerId: `t-${index}-${row}`,
        name: `Territory ${index}-${row}`,
        value: 100 - row
      })),
      mostPoints: Array.from({ length: 4 }, (__, row) => ({
        playerId: `p-${index}-${row}`,
        name: `Points ${index}-${row}`,
        value: 90 - row
      })),
      longestSurvivalMs: Array.from({ length: 4 }, (__, row) => ({
        playerId: `l-${index}-${row}`,
        name: `Survival ${index}-${row}`,
        value: 80 - row
      })),
      winner: {
        playerId: `w-${index}`,
        playerName: `Winner ${index}`,
        crownedAt: 1_000 + index,
        objectiveId: "ECONOMIC_HEGEMONY",
        objectiveName: "Economic Hegemony"
      },
      replayEvents: [
        {
          id: `event-${index}`,
          at: 500 + index,
          type: "WINNER",
          label: `Winner event ${index}`
        }
      ]
    }));

    registerServerHttpRoutes(app, {
      startupState: { ready: true, startedAt: 1, completedAt: 2 },
      activeSeason: () => activeSeason,
      seasonWinner: () => undefined,
      activeRootNodeIds: () => activeRootNodeIds,
      activeTechNodeCount: () => activeTechNodeCount,
      archiveCount: () => archiveCount,
      currentLeaderboardSnapshot: () => leaderboard,
      currentVictoryPressureObjectives: () => seasonVictory,
      seasonArchives: () => seasonArchives,
      runtimeDashboardPayload: () => ({ ok: true }),
      renderRuntimeDashboardHtml: () => "<html></html>",
      runtimeIncidentLog: { bootId: "boot-1", getLastCrashReport: () => null },
      seasonsEnabled: true,
      startNewSeason: () => {
        activeSeason = makeSeason({ seasonId: "s-2", techTreeConfigId: "seasonal-default" });
        activeRootNodeIds = ["agriculture", "toolmaking"];
        activeTechNodeCount = 46;
        archiveCount = 2;
      },
      saveSnapshot: async () => {},
      regenerateWorldInPlace: () => {},
      players: new Map<string, Player>(),
      onlineSocketCount: () => 0,
      townsByTile: new Map<TileKey, { tileKey: TileKey }>(),
      parseKey: () => [0, 0],
      playerTile: () => ({ x: 0, y: 0 } as Tile),
      townSupport: () => ({ supportCurrent: 0, supportMax: 0 }),
      now: () => 0,
      telemetryCounters: { frontierClaims: 0, settlements: 0, breakthroughAttacks: 0, techUnlocks: 0 },
      aiTurnDebugByPlayer: new Map(),
      buildAdminPlayersPayload: () => ({ ok: true }),
      serverDebugBundle: {
        snapshot: () => [
          { at: 1, level: "info", event: "frontier_action_received", payload: {} }
        ],
        snapshotAttackTraces: () => [
          {
            traceId: "trace-1",
            firstAt: 1,
            lastAt: 2,
            playerId: "p1",
            actionType: "ATTACK",
            origin: { x: 1, y: 2 },
            target: { x: 3, y: 4 },
            events: [{ at: 1, level: "info", event: "frontier_action_received", payload: {} }]
          }
        ]
      }
    });

    activeSeason = makeSeason({ techTreeConfigId: "seasonal-default" });
    activeRootNodeIds = ["agriculture"];
    activeTechNodeCount = 46;
    archiveCount = 1;

    const seasonResponse = await app.inject({ method: "GET", url: "/season" });
    const hqResponse = await app.inject({ method: "GET", url: "/hq/summary" });

    expect(seasonResponse.statusCode).toBe(200);
    expect(seasonResponse.json()).toMatchObject({
      seasonTechTreeId: "seasonal-default",
      activeRoots: ["agriculture"],
      activeTechNodeCount: 46,
      archiveCount: 1
    });

    expect(hqResponse.statusCode).toBe(200);
    const hqPayload = hqResponse.json();
    expect(hqPayload).toMatchObject({
      ok: true,
      seasonTechTreeId: "seasonal-default",
      activeRoots: ["agriculture"],
      activeTechNodeCount: 46,
      archiveCount: 1,
      leaderboard: {
        overall: [{ id: "p1", name: "Ashen Reach", rank: 1 }]
      },
      seasonVictory: [{ id: "TOWN_CONTROL", leaderName: "Ashen Reach" }],
      onlinePlayers: 0,
      totalPlayers: 0,
      townCount: 0
    });
    expect(hqPayload.seasonArchives).toHaveLength(5);
    expect(hqPayload.seasonArchives[0]).toMatchObject({
      seasonId: "s-6",
      winner: { playerName: "Winner 5" },
      mostTerritory: [{ name: "Territory 5-0" }, { name: "Territory 5-1" }, { name: "Territory 5-2" }]
    });
    expect(hqPayload.seasonArchives[0].mostTerritory).toHaveLength(3);
    expect(hqPayload.seasonArchives[0].mostPoints).toHaveLength(3);
    expect(hqPayload.seasonArchives[0].longestSurvivalMs).toHaveLength(3);
    expect(hqPayload.seasonArchives[0].replayEvents).toBeUndefined();

    const rolloverResponse = await app.inject({ method: "POST", url: "/admin/season/rollover" });

    expect(rolloverResponse.statusCode).toBe(200);
    expect(rolloverResponse.json()).toMatchObject({
      ok: true,
      activeSeason: expect.objectContaining({
        seasonId: "s-2",
        techTreeConfigId: "seasonal-default"
      })
    });

    const debugBundleResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });

    expect(debugBundleResponse.statusCode).toBe(200);
    expect(debugBundleResponse.json()).toMatchObject({
      ok: true,
      attackDebug: {
        controlPath: [{ event: "frontier_action_received" }],
        hotPath: [],
        slowOrWarn: []
      },
      attackTraces: [{ traceId: "trace-1", actionType: "ATTACK" }],
      health: {
        ok: true,
        startupElapsedMs: 1
      },
      recentServerEvents: [{ event: "frontier_action_received" }]
    });

    await app.close();
  });
});
