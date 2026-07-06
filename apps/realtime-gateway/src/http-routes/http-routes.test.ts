import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes } from "./http-routes.js";
import { InMemoryRallyLinkStore } from "../rally-link-store/rally-link-store.js";

describe("gateway http routes", () => {
  it("serves health and debug bundle with CORS headers", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: true,
        simulation: {
          connected: true,
          lastReadyAt: 1_100
        }
      }),
      snapshotDir: "/tmp/snapshot",
      supportedMessageTypes: ["ATTACK", "COLLECT_VISIBLE"],
      recentEvents: () => [{ at: 1_200, level: "info", event: "gateway_started", payload: {} }],
      attackDebug: () => ({
        controlPath: [{ at: 1_210, level: "info", event: "gateway_auth", payload: { channel: "control" } }],
        hotPath: [{ at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } }],
        slowOrWarn: [{ at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } }]
      }),
      attackTraces: () => [
        {
          traceId: "cmd-1",
          firstAt: 1_220,
          lastAt: 1_230,
          events: [
            { at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } },
            { at: 1_230, level: "warn", event: "simulation_submit_failed", payload: { commandId: "cmd-1" } }
          ]
        }
      ],
      metrics: () => "gateway_event_loop_max_ms 4\n",
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: "active",
        startedAt: 1_000,
        worldSeed: 42,
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
        updatedAt: 1_200
      }),
      getCurrentSeasonStatus: async () => "active",
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" })
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:5173" } });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(healthResponse.json()).toEqual(
      expect.objectContaining({
        ok: true,
        simulation: {
          connected: true,
          lastReadyAt: 1_100
        }
      })
    );

    const healthzResponse = await app.inject({ method: "GET", url: "/healthz" });
    expect(healthzResponse.statusCode).toBe(200);
    expect(healthzResponse.json()).toEqual({
      ok: true,
      readiness: {
        ok: true,
        simulation: {
          connected: true,
          lastReadyAt: 1_100
        }
      }
    });

    const metricsResponse = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.headers["content-type"]).toContain("text/plain");
    expect(metricsResponse.body).toContain("gateway_event_loop_max_ms 4");

    const debugResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle", headers: { origin: "http://localhost:5173" } });
    expect(debugResponse.statusCode).toBe(200);
    expect(debugResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(debugResponse.json()).toEqual(
      expect.objectContaining({
        ok: true,
        recentServerEvents: [expect.objectContaining({ event: "gateway_started" })],
        attackDebug: {
          controlPath: [expect.objectContaining({ event: "gateway_auth" })],
          hotPath: [expect.objectContaining({ event: "pending_input_to_state" })],
          slowOrWarn: [expect.objectContaining({ event: "pending_input_to_state" })]
        },
        attackTraces: [expect.objectContaining({ traceId: "cmd-1" })],
        runtime: {
          gateway: expect.objectContaining({
            simulationAddress: "127.0.0.1:50051",
            snapshotBridgeEnabled: true
          })
        }
      })
    );
    await app.close();
  });

  it("returns 503 when simulation connectivity is down", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: false,
        simulation: {
          connected: false,
          lastError: "simulation ping timed out after 1500ms"
        }
      }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => "",
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: "active",
        startedAt: 1_000,
        worldSeed: 42,
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
        updatedAt: 1_100
      }),
      getCurrentSeasonStatus: async () => "active",
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" })
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(503);
    expect(healthResponse.json()).toEqual(
      expect.objectContaining({
        ok: false,
        simulation: {
          connected: false,
          lastError: "simulation ping timed out after 1500ms"
        }
      })
    );

    const healthzResponse = await app.inject({ method: "GET", url: "/healthz" });
    expect(healthzResponse.statusCode).toBe(200);
    expect(healthzResponse.json()).toEqual({
      ok: true,
      readiness: {
        ok: false,
        simulation: {
          connected: false,
          lastError: "simulation ping timed out after 1500ms"
        }
      }
    });

    await app.close();
  });

  it("surfaces slow and failed gateway events in the debug bundle traces", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: true,
        simulation: {
          connected: true
        }
      }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [
        { at: 1_200, level: "info", event: "gateway_started", payload: {} },
        { at: 1_250, level: "warn", event: "gateway_command_submit_slow", payload: { durationMs: 1400 } }
      ],
      attackDebug: () => ({
        controlPath: [],
        hotPath: [{ at: 1_250, level: "warn", event: "gateway_command_submit_slow", payload: { durationMs: 1400 } }],
        slowOrWarn: [{ at: 1_250, level: "warn", event: "gateway_command_submit_slow", payload: { durationMs: 1400 } }]
      }),
      attackTraces: () => [
        {
          traceId: "cmd-slow",
          firstAt: 1_250,
          lastAt: 1_250,
          events: [{ at: 1_250, level: "warn", event: "gateway_command_submit_slow", payload: { durationMs: 1400 } }]
        }
      ],
      metrics: () => "",
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: "active",
        startedAt: 1_000,
        worldSeed: 42,
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
        updatedAt: 1_100
      }),
      getCurrentSeasonStatus: async () => "active",
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" })
    });

    const debugResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });
    expect(debugResponse.statusCode).toBe(200);
    expect(debugResponse.json()).toEqual(
      expect.objectContaining({
        attackDebug: expect.objectContaining({
          hotPath: [expect.objectContaining({ event: "gateway_command_submit_slow" })],
          slowOrWarn: [expect.objectContaining({ event: "gateway_command_submit_slow" })]
        }),
        attackTraces: [expect.objectContaining({ traceId: "cmd-slow", events: [expect.objectContaining({ event: "gateway_command_submit_slow" })] })]
      })
    );

    await app.close();
  });

  it("serves current summary, archives, and protects start-next", async () => {
    const startNextSeasonCalls: boolean[] = [];
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: true,
        simulation: {
          connected: true
        }
      }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => "",
      adminApiToken: "secret",
      getCurrentSeasonSummary: async () => ({
        season: "season-9",
        seasonId: "season-9",
        seasonSequence: 9,
        status: "ended",
        startedAt: 1_000,
        endedAt: 2_000,
        worldSeed: 99,
        rulesetId: "seasonal-default",
        seasonWinner: {
          playerId: "player-1",
          playerName: "Nauticus",
          crownedAt: 2_000,
          objectiveId: "TOWN_CONTROL",
          objectiveName: "Town Control"
        },
        leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
        overall: [],
        byTiles: [],
        byIncome: [],
        byTechs: [],
        seasonVictory: [],
        onlinePlayers: 1,
        totalPlayers: 3,
        townCount: 12,
        updatedAt: 2_000
      }),
      getCurrentSeasonStatus: async () => "ended",
      listSeasonArchives: async () => [
        {
          seasonId: "season-8",
          seasonSequence: 8,
          endedAt: 900,
          updatedAt: 900,
          mostTerritory: [],
          mostPoints: [],
          longestSurvivalMs: [],
          replayEvents: []
        }
      ],
      getAdminPlayers: async () => [],
      startNextSeason: async (force) => {
        startNextSeasonCalls.push(force === true);
        return { seasonId: force ? "season-11" : "season-10" };
      }
    });

    const summaryResponse = await app.inject({ method: "GET", url: "/hq/summary" });
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toEqual(expect.objectContaining({ seasonId: "season-9", status: "ended" }));

    const archivesResponse = await app.inject({ method: "GET", url: "/hq/archives" });
    expect(archivesResponse.statusCode).toBe(200);
    expect(archivesResponse.json()).toEqual({ archives: [expect.objectContaining({ seasonId: "season-8" })] });

    const unauthorizedResponse = await app.inject({ method: "POST", url: "/admin/season/start-next" });
    expect(unauthorizedResponse.statusCode).toBe(401);

    const authorizedResponse = await app.inject({
      method: "POST",
      url: "/admin/season/start-next",
      headers: { authorization: "Bearer secret" }
    });
    expect(authorizedResponse.statusCode).toBe(200);
    expect(authorizedResponse.json()).toEqual({ ok: true, seasonId: "season-10" });

    const forcedResponse = await app.inject({
      method: "POST",
      url: "/admin/season/start-next?force=1",
      headers: { authorization: "Bearer secret" }
    });
    expect(forcedResponse.statusCode).toBe(200);
    expect(forcedResponse.json()).toEqual({ ok: true, seasonId: "season-11" });
    expect(startNextSeasonCalls).toEqual([false, true]);

    await app.close();
  });

  it("gates /admin/players behind the admin token and returns gold + tile counts", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({ ok: true, simulation: { connected: true } }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => "",
      adminApiToken: "secret",
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: "active",
        startedAt: 1_000,
        worldSeed: 42,
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
        updatedAt: 1_100
      }),
      getCurrentSeasonStatus: async () => "active",
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [
        {
          id: "player-1",
          name: "Nauticus",
          isAi: false,
          gold: 1_250,
          settledTiles: 40,
          ownedTiles: 55,
          incomePerMinute: 12.5,
          techs: 6,
          manpower: 300,
          food: 120,
          iron: 30,
          crystal: 5,
          supply: 60
        },
        {
          id: "ai-1",
          name: "ai-1",
          isAi: true,
          gold: 80,
          settledTiles: 5,
          ownedTiles: 9,
          incomePerMinute: 2.1,
          techs: 1,
          manpower: 40,
          food: 10,
          iron: 0,
          crystal: 0,
          supply: 4
        }
      ],
      startNextSeason: async () => ({ seasonId: "season-2" })
    });

    const unauthorizedResponse = await app.inject({ method: "GET", url: "/admin/players" });
    expect(unauthorizedResponse.statusCode).toBe(401);

    const authorizedResponse = await app.inject({
      method: "GET",
      url: "/admin/players",
      headers: { authorization: "Bearer secret" }
    });
    expect(authorizedResponse.statusCode).toBe(200);
    expect(authorizedResponse.json()).toEqual({
      ok: true,
      players: [
        expect.objectContaining({ id: "player-1", gold: 1_250, settledTiles: 40, ownedTiles: 55, manpower: 300, food: 120, iron: 30, crystal: 5, supply: 60 }),
        expect.objectContaining({ id: "ai-1", isAi: true, gold: 80, settledTiles: 5, ownedTiles: 9, manpower: 40, food: 10, iron: 0, crystal: 0, supply: 4 })
      ]
    });

    const queryTokenResponse = await app.inject({ method: "GET", url: "/admin/players?token=secret" });
    expect(queryTokenResponse.statusCode).toBe(200);

    await app.close();
  });

  it("mints, reads, lists, and revokes rally links", async () => {
    const app = Fastify();
    const rallyLinkStore = new InMemoryRallyLinkStore();
    let seasonStatus: "active" | "ended" = "active";
    let ownerAnchor = { x: 12, y: 34 };
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({ ok: true, simulation: { connected: true } }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => "",
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: seasonStatus,
        startedAt: 1_000,
        worldSeed: 42,
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
        updatedAt: 1_100
      }),
      getCurrentSeasonStatus: async () => seasonStatus,
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" }),
      playOrigin: "https://play.example.test",
      rallyLinkStore,
      authenticateBearer: async () => ({ playerId: "owner-1", playerName: "Owner" }),
      preparePlayer: async () => ({ playerId: "owner-1", spawned: false }),
      subscribePlayer: async () => ({
        player: { name: "Owner" },
        tiles: [{ ...ownerAnchor, ownerId: "owner-1", ownershipState: "SETTLED", townType: "FARMING" }]
      })
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/rally/links",
      headers: { authorization: "Bearer token" },
      payload: { maxUses: 2, ttlHours: 24 }
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created.url).toMatch(/^https:\/\/play\.example\.test\/r\/r_/);
    expect(created.anchor).toEqual({ x: 12, y: 34, island: "tile:12,34" });

    const publicResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toEqual(expect.objectContaining({ code: created.code, ownerName: "Owner", anchor: { x: 12, y: 34, island: "tile:12,34" } }));

    ownerAnchor = { x: 90, y: 91 };
    const movedOwnerResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(movedOwnerResponse.statusCode).toBe(200);
    expect(movedOwnerResponse.json().anchor).toEqual({ x: 12, y: 34, island: "tile:12,34" });

    seasonStatus = "ended";
    const endedSeasonResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(endedSeasonResponse.statusCode).toBe(404);
    seasonStatus = "active";

    const mineResponse = await app.inject({ method: "GET", url: "/rally/links/mine", headers: { authorization: "Bearer token" } });
    expect(mineResponse.statusCode).toBe(200);
    expect(mineResponse.json().links).toHaveLength(1);

    const deleteResponse = await app.inject({ method: "DELETE", url: `/rally/links/${created.code}`, headers: { authorization: "Bearer token" } });
    expect(deleteResponse.statusCode).toBe(200);
    const missingResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(missingResponse.statusCode).toBe(404);
    await app.close();
  });
});
