import fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { Player, Season, Tile, TileKey } from "@border-empires/shared";
import { registerServerHttpRoutes } from "./server-http-routes.js";

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

    registerServerHttpRoutes(app, {
      startupState: { ready: true, startedAt: 1, completedAt: 2 },
      activeSeason: () => activeSeason,
      seasonWinner: () => undefined,
      activeRootNodeIds: () => activeRootNodeIds,
      activeTechNodeCount: () => activeTechNodeCount,
      archiveCount: () => archiveCount,
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

    expect(seasonResponse.statusCode).toBe(200);
    expect(seasonResponse.json()).toMatchObject({
      seasonTechTreeId: "seasonal-default",
      activeRoots: ["agriculture"],
      activeTechNodeCount: 46,
      archiveCount: 1
    });

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
